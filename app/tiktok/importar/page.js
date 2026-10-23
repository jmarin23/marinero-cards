"use client";
import Volver from "@/components/Volver";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { CAMPOS, detectarEncabezado, puntajeEncabezado, esAjuste, adivinarColumnas, aNumero, aFecha, aId, estadoDe, empatar, repararRangos, similitud, agruparVentas, idsDe } from "@/lib/tiktok";

// Flujo en una sola pantalla: subes el archivo y TikTok se lee solo.
// Lo que ya se reconoce se aplica solo; lo demás lo asignas aquí mismo (producto + cliente) sin ir a Revisar.
const AUTO_MIN = 3.5; // monto exacto => se empata solo

export default function ImportarTikTok() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [prods, setProds] = useState([]);
  const [archivo, setArchivo] = useState("");
  const [wb, setWb] = useState(null);
  const [hoja, setHoja] = useState("");
  const [filas, setFilas] = useState([]);
  const [hdr, setHdr] = useState(0);
  const [map, setMap] = useState({});
  const [filas2, setFilas2] = useState(null);   // filas ya analizadas
  const [tieneCant, setTieneCant] = useState(false);
  const [grupos, setGrupos] = useState([]);       // piezas de TikTok que suman una venta ya capturada
  const [ventas, setVentas] = useState([]);
  const [msg, setMsg] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    sb.from("v_productos").select("id_producto,id_lote,nombre,inventario,categoria").order("id_producto").range(0, 4999)
      .then(({ data }) => setProds((data || []).filter((p) => p.categoria !== "Costo extra")));
  }, [sb]);

  const etiqueta = (p) => `${p.id_producto} · ${p.nombre}`;

  async function leer(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(null); setFilas2(null); setGrupos([]); setArchivo(f.name);
    try {
      const esCsv = /\.csv$/i.test(f.name);
      const libro = repararRangos(XLSX, esCsv
        ? XLSX.read(await f.text(), { type: "string", raw: true })
        : XLSX.read(await f.arrayBuffer(), { type: "array" }));
      setWb(libro);
      const mejor = libro.SheetNames.reduce((a, n) => {
        const m = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: "" });
        const r = puntajeEncabezado(m) + (/pedido|order/i.test(n) ? 0.5 : 0);
        return r > a.r ? { n, r } : a;
      }, { n: libro.SheetNames[0], r: -1 }).n;
      await cargarHoja(libro, mejor);
    } catch (err) {
      setMsg({ ok: false, t: "No pude leer el archivo: " + err.message });
    }
  }

  async function cargarHoja(libro, nombre) {
    setHoja(nombre);
    const m = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "" });
    const h = detectarEncabezado(m);
    const mp = adivinarColumnas((m[h] || []).map(String));
    setFilas(m); setHdr(h); setMap(mp);
    if (mp.id >= 0 && mp.monto >= 0) await analizar(m, h, mp);
    else { setFilas2(null); setMsg({ ok: false, t: "No reconocí las columnas del reporte. Elígelas abajo." }); }
  }

  async function analizar(m = filas, h = hdr, mp = map) {
    setMsg(null);
    if (mp.id == null || mp.id < 0 || mp.monto == null || mp.monto < 0) return setMsg({ ok: false, t: "Elige las columnas de ID del pedido y Monto liquidado." });
    setTrabajando(true);
    setTieneCant(mp.cantidad >= 0);
    const datos = m.slice(h + 1).map((r) => ({
      id: aId(r[mp.id]),
      monto: aNumero(r[mp.monto]),
      fecha: mp.fecha >= 0 ? aFecha(r[mp.fecha]) : null,
      producto: mp.producto >= 0 ? String(r[mp.producto] || "") : "",
      cantidad: mp.cantidad >= 0 ? aNumero(r[mp.cantidad]) || 1 : 1,
      tipo: mp.tipo >= 0 ? String(r[mp.tipo] || "") : "",
      estado: estadoDe(mp.estado >= 0 ? r[mp.estado] : "", null),
    })).map((d) => (esAjuste(d.tipo) ? { ...d, estado: "Reembolso" } : d)).filter((d) => d.id && d.monto != null);
    if (!datos.length) { setTrabajando(false); return setMsg({ ok: false, t: "No encontré filas con ID y monto." }); }

    const { data, error } = await sb.from("ventas").select("*, productos(nombre)").range(0, 4999);
    if (error) { setTrabajando(false); return setMsg({ ok: false, t: error.message }); }
    const vs = (data || []).map((v) => ({ ...v, monto_neto: Number(v.monto_neto), producto_nombre: v.productos?.nombre || "" }));
    setVentas(vs);
    let lista = prods;
    if (!lista.length) {
      const { data: pd } = await sb.from("v_productos").select("id_producto,id_lote,nombre,inventario,categoria").order("id_producto").range(0, 4999);
      lista = (pd || []).filter((p) => p.categoria !== "Costo extra");
      setProds(lista);
    }

    const filasEmp = empatar(datos, vs).map((r) => {
      if (esAjuste(r.f.tipo)) return { ...r, grupo: "ignorar", venta: null, prodTxt: "", cliente: "" };
      if (r.accion === "incluida") return { ...r, grupo: "ya", prodTxt: "", cliente: "" };
      if (r.accion === "actualizar" || (r.accion === "empatar" && r.score >= AUTO_MIN)) return { ...r, grupo: "auto", prodTxt: "", cliente: "" };
      // por asignar: sugiere producto por nombre si el reporte lo trae
      const sug = sugerencias(r.f.producto, lista);
      const prodTxt = sug[0] && sug[0].s >= 0.6 ? etiqueta(sug[0].p) : "";
      return { ...r, grupo: "asignar", venta: null, accion: "crear", prodTxt, cliente: "" };
    });
    // piezas sueltas que suman una venta que ya capturaste como una sola
    const reclamadas = new Set(filasEmp.filter((r) => r.grupo === "auto").map((r) => r.venta.id_venta));
    const libresV = vs.filter((v) => !idsDe(v.id_pedido_tiktok).length && (v.canal === "TikTok" || !v.canal) && v.estado !== "Reembolso" && !reclamadas.has(v.id_venta));
    const gr = agruparVentas(filasEmp.filter((r) => r.grupo === "asignar"), libresV);
    const enGrupo = new Set(gr.flatMap((g) => g.filas.map((r) => r.i)));
    setGrupos(gr.map((g, n) => ({ ...g, n, filas: g.filas.map((r) => r.i), resumen: g.filas.map((r) => r.f) })));
    setFilas2(filasEmp.map((r) => (enGrupo.has(r.i) ? { ...r, grupo: "agrupada" } : r)));
    setTrabajando(false);
  }

  function sugerencias(texto, lista) {
    if (!texto) return [];
    return lista.map((p) => ({ p, s: similitud(texto, p.nombre) + (p.inventario > 0 ? 0.05 : 0) }))
      .filter((x) => x.s > 0.2).sort((a, b) => b.s - a.s).slice(0, 3);
  }

  const edit = (i, cambios) => setFilas2((rs) => rs.map((r) => (r.i === i ? { ...r, ...cambios } : r)));
  function quitarGrupo(n) {
    const g = grupos.find((x) => x.n === n);
    setFilas2((rs) => rs.map((r) => (g.filas.includes(r.i) ? { ...r, grupo: "asignar" } : r)));
    setGrupos((gs) => gs.filter((x) => x.n !== n));
  }
  const grupo = (g) => (filas2 || []).filter((r) => r.grupo === g);
  const yaIncluidas = grupo("ya");
  const autos = grupo("auto"), porAsignar = grupo("asignar"), ignoradas = grupo("ignorar"), omitidas = grupo("omitir");

  async function aplicar() {
    setTrabajando(true); setMsg(null);
    let act = 0, nuevas = 0, sinProd = 0; const fallos = [];
    const { data: ids } = await sb.from("ventas").select("id_venta");
    let max = (ids || []).reduce((m, x) => Math.max(m, parseInt(String(x.id_venta).replace(/\D/g, ""), 10) || 0), 0);
    for (const g of grupos) {
      const fs = filas2.filter((r) => g.filas.includes(r.i));
      const estados = fs.map((r) => r.f.estado);
      const estado = estados.every((e) => e === "Pagado") ? "Pagado" : estados.includes("En espera") ? "En espera" : estados[0];
      const cambios = { id_pedido_tiktok: fs.map((r) => r.f.id).join(","), estado };
      if (!g.venta.fecha) cambios.fecha = fs.map((r) => r.f.fecha).filter(Boolean).sort()[0] || null;
      const { error } = await sb.from("ventas").update(cambios).eq("id_venta", g.venta.id_venta);
      if (error) fallos.push(`${g.venta.id_venta}: ${error.message}`); else act++;
    }
    for (const r of filas2) {
      if (r.grupo === "auto" && r.venta) {
        const cambios = { id_pedido_tiktok: r.f.id, estado: r.f.estado, monto_neto: r.f.monto };
        if (!r.venta.fecha && r.f.fecha) cambios.fecha = r.f.fecha;
        if (tieneCant && r.f.cantidad > 0) cambios.cantidad = r.f.cantidad;
        const { error } = await sb.from("ventas").update(cambios).eq("id_venta", r.venta.id_venta);
        if (error) fallos.push(`${r.f.id}: ${error.message}`); else act++;
      } else if (r.grupo === "asignar") {
        const p = prods.find((x) => etiqueta(x) === r.prodTxt);
        max += 1;
        const fila = {
          id_venta: "V" + String(max).padStart(4, "0"),
          fecha: r.f.fecha, canal: "TikTok", cantidad: r.f.cantidad, monto_neto: r.f.monto,
          estado: p ? r.f.estado : "Revisar", id_pedido_tiktok: r.f.id,
          cliente_notas: r.cliente.trim() || null,
        };
        if (p) { fila.id_producto = p.id_producto; fila.id_lote = p.id_lote; } else sinProd++;
        const { error } = await sb.from("ventas").insert(fila);
        if (error) fallos.push(`${r.f.id}: ${error.message}`); else nuevas++;
      }
    }
    setTrabajando(false);
    setMsg({ ok: fallos.length === 0, t: `Listo: ${act} pagos empatados solos, ${nuevas} ventas nuevas${sinProd ? ` (${sinProd} sin producto, quedaron en Revisar)` : ""}.${fallos.length ? " Fallaron: " + fallos.slice(0, 3).join(" | ") : ""}` });
    if (!fallos.length) { setFilas2(null); setGrupos([]); }
  }

  const encabezados = (filas[hdr] || []).map((x, i) => ({ i, t: String(x || `Columna ${i + 1}`) }));
  const aGuardar = autos.length + porAsignar.length + grupos.length;

  return (
    <div className="space-y-4">
      <Volver a="/datos" />
      <h1 className="text-2xl font-semibold">Importar TikTok</h1>
      <p className="text-sm text-white/50">Sube el reporte tal cual lo bajas de TikTok. Yo leo solo lo que sirve (fecha, producto, monto) y empato lo que ya tenías capturado; lo que sobra lo asignas aquí mismo.</p>
      {msg && <div className={`card text-sm ${msg.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{msg.t}</div>}

      <label className="card flex cursor-pointer items-center justify-between gap-3 border-dashed">
        <span className="text-sm">{archivo || "Toca para elegir el archivo (.xlsx o .csv)"}</span>
        <span className="btn !py-2 text-sm">Elegir</span>
        <input className="hidden" type="file" accept=".xlsx,.xls,.csv" onChange={leer} />
      </label>
      {trabajando && !filas2 && <p className="text-white/50">Leyendo…</p>}

      {wb && !filas2 && !trabajando && (
        <section className="card space-y-3">
          {wb.SheetNames.length > 1 && (
            <label className="block text-sm text-white/60">Hoja
              <select className="input mt-1" value={hoja} onChange={(e) => cargarHoja(wb, e.target.value)}>
                {wb.SheetNames.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CAMPOS.filter((c) => ["id", "monto", "fecha", "producto"].includes(c.k)).map((c) => (
              <label key={c.k} className="text-sm text-white/60">{c.l}{c.req && " *"}
                <select className="input mt-1" value={map[c.k] ?? -1} onChange={(e) => setMap({ ...map, [c.k]: Number(e.target.value) })}>
                  <option value={-1}>— no usar —</option>
                  {encabezados.map((h) => <option key={h.i} value={h.i}>{h.t}</option>)}
                </select>
              </label>
            ))}
          </div>
          <button className="btn w-full" onClick={() => analizar()}>Leer con estas columnas</button>
        </section>
      )}

      {filas2 && (
        <section className="space-y-4">
          <div className="card text-sm">
            <b>{filas2.length}</b> filas en el archivo ·{" "}
            <span className="text-emerald-400">{autos.length + grupos.reduce((t, g) => t + g.filas.length, 0) + yaIncluidas.length} ya estaban capturadas</span> ·{" "}
            <span className="text-amber-400">{porAsignar.length} por asignar</span>
            {ignoradas.length > 0 && <> · <span className="text-white/40">{ignoradas.length} ajustes ignorados</span></>}
          </div>

          {grupos.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm text-white/60">Piezas de TikTok que ya capturaste como una sola venta</h2>
              {grupos.map((g) => (
                <div key={g.n} className="card space-y-2">
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div><b>{g.filas.length} pzas</b> de TikTok = {g.venta.id_venta} · {g.venta.producto_nombre || "sin producto"}</div>
                      <div className="text-xs text-white/50">{Number(g.venta.cantidad) !== g.filas.length ? `Tu venta cuenta ${g.venta.cantidad} (por ejemplo una caja vendida en sobres); la cantidad no se cambia. ` : "Cantidad coincide. "}{g.ambigua && "Pudo ser otra combinación. "}</div>
                    </div>
                    <div className="shrink-0 font-semibold text-emerald-400">{mxn(g.suma)}</div>
                  </div>
                  <div className="text-xs text-white/50">{g.resumen.map((f) => mxn(f.monto)).join(" + ")}</div>
                  <button className="text-xs text-white/40" onClick={() => quitarGrupo(g.n)}>No es esa venta, asignar una por una</button>
                </div>
              ))}
            </div>
          )}

          {porAsignar.length > 0 && <h2 className="text-sm text-white/60">Por asignar — pon el producto y, si quieres, el cliente</h2>}
          {porAsignar.map((r) => {
            const sug = sugerencias(r.f.producto, prods);
            return (
              <div key={r.i} className="card space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm">{r.f.producto || "(el reporte no trae producto)"}</div>
                    <div className="text-xs text-white/50">{r.f.fecha || "sin fecha"} · {r.f.estado}{r.f.cantidad > 1 ? ` · ${r.f.cantidad} pzas` : ""}</div>
                  </div>
                  <div className="shrink-0 font-semibold text-amber-400">{mxn(r.f.monto)}</div>
                </div>
                <input className="input" list="productos-tt" placeholder="Producto (escribe para buscar)" value={r.prodTxt} onChange={(e) => edit(r.i, { prodTxt: e.target.value })} />
                {sug.length > 0 && !r.prodTxt && (
                  <div className="flex flex-wrap gap-2">
                    {sug.map(({ p }) => (
                      <button key={p.id_producto} className="rounded-full border border-amber-500/40 px-3 py-1 text-xs text-amber-300" onClick={() => edit(r.i, { prodTxt: etiqueta(p) })}>{p.nombre.slice(0, 28)}</button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input className="input" placeholder="Cliente (opcional)" value={r.cliente} onChange={(e) => edit(r.i, { cliente: e.target.value })} />
                  <button className="shrink-0 text-sm text-white/40" onClick={() => edit(r.i, { grupo: "omitir" })}>Omitir</button>
                </div>
              </div>
            );
          })}

          {autos.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer text-sm text-emerald-300">{autos.length} pagos que ya empaté solos (toca para revisar)</summary>
              <div className="mt-3 space-y-2">
                {autos.map((r) => (
                  <div key={r.i} className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{r.venta.producto_nombre || r.venta.id_venta} <span className="text-white/40">· {r.venta.id_venta}</span></div>
                      <div className="text-xs text-white/50">{r.f.fecha || ""} · {r.f.estado}{r.accion === "empatar" ? " · por monto" : " · por ID"}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-amber-400">{mxn(r.f.monto)}</div>
                      <button className="text-xs text-white/40" onClick={() => edit(r.i, { grupo: "asignar", venta: null, accion: "crear", prodTxt: "", cliente: "" })}>No es esa</button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {(omitidas.length > 0 || ignoradas.length > 0) && (
            <details className="card">
              <summary className="cursor-pointer text-sm text-white/50">{omitidas.length + ignoradas.length} omitidas / ajustes</summary>
              <div className="mt-3 space-y-2">
                {[...omitidas, ...ignoradas].map((r) => (
                  <div key={r.i} className="flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-sm text-white/60">
                    <div className="min-w-0 truncate">{r.f.producto || r.f.tipo || r.f.id} · {r.f.fecha || ""}</div>
                    <div className="shrink-0">{mxn(r.f.monto)}</div>
                    {r.grupo === "omitir" && <button className="text-xs text-amber-300" onClick={() => edit(r.i, { grupo: "asignar" })}>Quitar</button>}
                  </div>
                ))}
              </div>
            </details>
          )}

          <datalist id="productos-tt">{prods.map((p) => <option key={p.id_producto} value={etiqueta(p)} />)}</datalist>
          <div className="sticky bottom-20 rounded-xl border border-white/10 bg-[#171b21] p-4">
            <button className="btn w-full" onClick={aplicar} disabled={trabajando || aGuardar === 0}>{trabajando ? "Guardando…" : `Guardar ${aGuardar} cambios`}</button>
            {porAsignar.some((r) => !prods.find((p) => etiqueta(p) === r.prodTxt)) && (
              <p className="mt-2 text-xs text-white/40">Las que no tengan producto se guardan en &quot;Revisar&quot; para completarlas después.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
