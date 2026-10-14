"use client";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { CAMPOS, detectarEncabezado, puntajeEncabezado, esAjuste, adivinarColumnas, aNumero, aFecha, aId, estadoDe, empatar, repararRangos } from "@/lib/tiktok";

export default function ImportarTikTok() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [wb, setWb] = useState(null);
  const [hoja, setHoja] = useState("");
  const [filas, setFilas] = useState([]);         // matriz cruda
  const [hdr, setHdr] = useState(0);
  const [map, setMap] = useState({});
  const [modoEstado, setModoEstado] = useState("segun");
  const [actMonto, setActMonto] = useState(true);
  const [res, setRes] = useState(null);           // resultados de empate
  const [ventas, setVentas] = useState([]);
  const [msg, setMsg] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState("");

  async function leer(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setMsg(null); setRes(null); setAviso("");
    try {
      const esCsv = /\.csv$/i.test(f.name);
      const libro = repararRangos(XLSX, esCsv
        ? XLSX.read(await f.text(), { type: "string", raw: true })
        : XLSX.read(await f.arrayBuffer(), { type: "array" }));
      setWb(libro);
      // la hoja con más columnas reconocidas (en TikTok es "Detalles del pedido")
      const mejor = libro.SheetNames.reduce((a, n) => {
        const m = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: "" });
        const r = puntajeEncabezado(m) + (/pedido|order/i.test(n) ? 0.5 : 0);
        return r > a.r ? { n, r } : a;
      }, { n: libro.SheetNames[0], r: -1 }).n;
      cargarHoja(libro, mejor);
    } catch (err) {
      setMsg({ ok: false, t: "No pude leer el archivo: " + err.message });
    }
  }

  function cargarHoja(libro, nombre) {
    setHoja(nombre);
    const m = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, raw: true, defval: "" });
    setFilas(m);
    const h = detectarEncabezado(m);
    setHdr(h);
    setMap(adivinarColumnas((m[h] || []).map(String)));
    setRes(null);
  }

  const encabezados = (filas[hdr] || []).map((x, i) => ({ i, t: String(x || `Columna ${i + 1}`) }));

  async function analizar() {
    setMsg(null);
    if (map.id < 0 || map.monto < 0 || map.id == null || map.monto == null) return setMsg({ ok: false, t: "Elige al menos las columnas de ID del pedido y Monto liquidado." });
    setTrabajando(true);
    const datos = filas.slice(hdr + 1).map((r) => ({
      id: aId(r[map.id]),
      monto: aNumero(r[map.monto]),
      fecha: map.fecha >= 0 ? aFecha(r[map.fecha]) : null,
      producto: map.producto >= 0 ? String(r[map.producto] || "") : "",
      cantidad: map.cantidad >= 0 ? aNumero(r[map.cantidad]) || 1 : 1,
      tipo: map.tipo >= 0 ? String(r[map.tipo] || "") : "",
      estado: estadoDe(map.estado >= 0 ? r[map.estado] : "", modoEstado === "segun" ? null : modoEstado),
    })).map((d) => (esAjuste(d.tipo) ? { ...d, estado: "Reembolso" } : d)).filter((d) => d.id && d.monto != null);
    if (!datos.length) { setTrabajando(false); return setMsg({ ok: false, t: "No encontré filas con ID y monto. Revisa las columnas elegidas." }); }
    if (filas.slice(hdr + 1).some((r) => typeof r[map.id] === "number" && r[map.id] > 1e15))
      setAviso("Ojo: los IDs vienen como número en el archivo y Excel pudo redondearlos. Si el empate falla, descarga el reporte como CSV o con la columna en formato Texto.");

    const { data, error } = await sb.from("ventas").select("*, productos(nombre)").range(0, 4999);
    if (error) { setTrabajando(false); return setMsg({ ok: false, t: error.message }); }
    const vs = (data || []).map((v) => ({ ...v, monto_neto: Number(v.monto_neto), producto_nombre: v.productos?.nombre || "" }));
    setVentas(vs);
    setRes(empatar(datos, vs).map((r) => (esAjuste(r.f.tipo) ? { ...r, accion: "ignorar", venta: null } : r)));
    setTrabajando(false);
  }

  const setAccion = (i, accion, idVenta) =>
    setRes((rs) => rs.map((r) => r.i !== i ? r : { ...r, accion, venta: idVenta ? ventas.find((v) => v.id_venta === idVenta) : r.venta }));

  const conteo = res ? {
    actualizar: res.filter((r) => r.accion === "actualizar").length,
    empatar: res.filter((r) => r.accion === "empatar").length,
    crear: res.filter((r) => r.accion === "crear").length,
    ignorar: res.filter((r) => r.accion === "ignorar").length,
  } : null;

  async function aplicar() {
    setTrabajando(true); setMsg(null);
    let hechas = 0, nuevas = 0, fallos = [];
    const { data: ids } = await sb.from("ventas").select("id_venta");
    let max = (ids || []).reduce((m, x) => Math.max(m, parseInt(String(x.id_venta).replace(/\D/g, ""), 10) || 0), 0);
    for (const r of res) {
      if (r.accion === "ignorar") continue;
      if ((r.accion === "actualizar" || r.accion === "empatar") && r.venta) {
        const cambios = { id_pedido_tiktok: r.f.id, estado: r.f.estado };
        if (actMonto && r.f.monto != null) cambios.monto_neto = r.f.monto;
        if (!r.venta.fecha && r.f.fecha) cambios.fecha = r.f.fecha;
        const { error } = await sb.from("ventas").update(cambios).eq("id_venta", r.venta.id_venta);
        if (error) fallos.push(`${r.f.id}: ${error.message}`); else hechas++;
      } else if (r.accion === "crear") {
        max += 1;
        const { error } = await sb.from("ventas").insert({
          id_venta: "V" + String(max).padStart(4, "0"),
          fecha: r.f.fecha, canal: "TikTok", cantidad: r.f.cantidad, monto_neto: r.f.monto,
          estado: "Revisar", id_pedido_tiktok: r.f.id,
          cliente_notas: `Importado de TikTok (${r.f.estado})${r.f.producto ? " · " + r.f.producto : ""} — falta ligar a un producto`,
        });
        if (error) fallos.push(`${r.f.id}: ${error.message}`); else nuevas++;
      }
    }
    setTrabajando(false);
    setMsg({ ok: fallos.length === 0, t: `Listo: ${hechas} ventas actualizadas, ${nuevas} nuevas para revisar.${fallos.length ? " Fallaron: " + fallos.slice(0, 3).join(" | ") : ""}` });
    if (!fallos.length) setRes(null);
  }

  const colorAccion = { actualizar: "text-emerald-400", empatar: "text-amber-400", crear: "text-sky-400", ignorar: "text-white/40" };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Importar TikTok</h1>
      <p className="text-sm text-white/50">Sube el Excel o CSV de &quot;Detalles del pedido&quot; de TikTok Shop. Empata por ID de pedido; si no lo encuentra, te sugiere la venta por monto y nombre.</p>
      {msg && <div className={`card text-sm ${msg.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{msg.t}</div>}

      <input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={leer} />

      {wb && (
        <section className="card space-y-3">
          {wb.SheetNames.length > 1 && (
            <label className="block text-sm text-white/60">Hoja
              <select className="input mt-1" value={hoja} onChange={(e) => cargarHoja(wb, e.target.value)}>
                {wb.SheetNames.map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
          )}
          <h2 className="text-sm text-white/60">Columnas ({filas.length - hdr - 1} filas). Corrige si adiviné mal:</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <label key={c.k} className="text-sm text-white/60">{c.l}{c.req && " *"}
                <select className="input mt-1" value={map[c.k] ?? -1} onChange={(e) => setMap({ ...map, [c.k]: Number(e.target.value) })}>
                  <option value={-1}>— no usar —</option>
                  {encabezados.map((h) => <option key={h.i} value={h.i}>{h.t}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="block text-sm text-white/60">Marcar las ventas como
            <select className="input mt-1" value={modoEstado} onChange={(e) => setModoEstado(e.target.value)}>
              <option value="segun">Según la columna de estado</option>
              <option value="Pagado">Pagado (todo lo del archivo ya se liquidó)</option>
              <option value="En espera">En espera</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-white/60">
            <input type="checkbox" checked={actMonto} onChange={(e) => setActMonto(e.target.checked)} /> Actualizar el monto neto con lo que liquidó TikTok
          </label>
          <button className="btn w-full" onClick={analizar} disabled={trabajando}>{trabajando ? "Analizando…" : "Analizar y empatar"}</button>
        </section>
      )}
      {aviso && <p className="text-sm text-amber-300">{aviso}</p>}

      {res && (
        <section className="space-y-3">
          <div className="card text-sm">
            <b>{res.length}</b> filas: <span className="text-emerald-400">{conteo.actualizar} ya con ID</span> · <span className="text-amber-400">{conteo.empatar} sugeridas</span> · <span className="text-sky-400">{conteo.crear} sin match</span> · {conteo.ignorar} ignoradas
          </div>
          {res.map((r) => (
            <div key={r.i} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm">{r.f.producto || "(sin producto en el reporte)"}</div>
                  <div className="truncate text-xs text-white/50">{r.f.id} · {r.f.fecha || "sin fecha"} · {esAjuste(r.f.tipo) ? r.f.tipo : r.f.estado}</div>
                </div>
                <div className="shrink-0 text-amber-400">{mxn(r.f.monto)}</div>
              </div>
              <div className="flex items-center gap-2">
                <select className={`input !py-2 text-sm ${colorAccion[r.accion]}`} value={r.accion} onChange={(e) => setAccion(r.i, e.target.value)}>
                  {r.venta && r.accion !== "actualizar" && <option value="empatar">Empatar con venta</option>}
                  {r.accion === "actualizar" && <option value="actualizar">Actualizar venta con este ID</option>}
                  <option value="crear">Crear venta nueva (revisar)</option>
                  <option value="ignorar">Ignorar</option>
                </select>
              </div>
              {(r.accion === "empatar" || r.accion === "actualizar") && (
                <select className="input !py-2 text-sm" value={r.venta?.id_venta || ""} onChange={(e) => setAccion(r.i, r.accion, e.target.value)}>
                  {[r.venta, ...ventas.filter((v) => !v.id_pedido_tiktok && v.canal === "TikTok" && v.id_venta !== r.venta?.id_venta && Math.abs(v.monto_neto - r.f.monto) / Math.max(1, v.monto_neto) < 0.25).slice(0, 15)].filter(Boolean).map((v) => (
                    <option key={v.id_venta} value={v.id_venta}>{v.id_venta} · {v.producto_nombre || "sin producto"} · {mxn(v.monto_neto)} · {v.estado}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <div className="sticky bottom-20 rounded-xl border border-white/10 bg-[#171b21] p-4">
            <button className="btn w-full" onClick={aplicar} disabled={trabajando}>{trabajando ? "Aplicando…" : "Aplicar cambios"}</button>
          </div>
        </section>
      )}
    </div>
  );
}
