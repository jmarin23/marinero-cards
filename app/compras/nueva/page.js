"use client";
import FotoLote from "@/components/FotoLote";
import { comprimirImagen, imagenDePegado, imagenDelPortapapeles, leerFotos, guardarFotosTxt, MAX_FOTOS } from "@/lib/foto";
import { useEffect, useMemo, useState } from "react";
import Volver from "@/components/Volver";
import { supabaseBrowser } from "@/lib/supabase/client";
import { listaSocios } from "@/lib/socios";
import Combo from "@/components/Combo";
import { mxn } from "@/lib/format";

const CATEGORIAS = ["Pokémon", "MLB", "NFL", "NBA", "Fut", "Costo extra", "Otro"];
const linea = () => ({ nombre: "", categoria: "Pokémon", cantidad: 1, precio: "", reventa: "", socio: "Yo", quien: "Yo" });
const num = (x) => Number(x) || 0;
const siguiente = (ids, pref, pad) => {
  const max = ids.reduce((m, id) => Math.max(m, parseInt(String(id).replace(/\D/g, ""), 10) || 0), 0);
  return (n) => pref + String(max + n).padStart(pad, "0");
};

export default function NuevaCompra() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [lotes, setLotes] = useState([]);
  const [socios, setSocios] = useState([]);
  const [loteSel, setLoteSel] = useState("__nuevo");
  const [loteNombre, setLoteNombre] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [notas, setNotas] = useState("");
  const [moneda, setMoneda] = useState("MXN");
  const [tc, setTc] = useState("18");
  const [impuesto, setImpuesto] = useState("0");
  const [envio, setEnvio] = useState("");
  const [taxUsa, setTaxUsa] = useState("");
  const [fotosNuevas, setFotosNuevas] = useState([]); // fotos del pedido (solo al crear)
  const [cruce, setCruce] = useState(""); // cruce USA–México (siempre MXN)
  const [lineas, setLineas] = useState([linea()]);
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [editId, setEditId] = useState(null);      // si viene ?lote=L19 se edita esa compra en lugar de crear una
  const [faltaSQL, setFaltaSQL] = useState(false); // aún no existen las columnas para guardar los datos originales
  const [sinDatos, setSinDatos] = useState(false); // compra vieja: no se guardaron sus datos originales

  async function cargarParaEditar(id) {
    const { data: lo, error } = await sb.from("lotes").select("*").eq("id_lote", id).single();
    if (error || !lo) return setMsg({ ok: false, t: "No encontré ese lote" });
    const { data: ps } = await sb.from("productos").select("*").eq("id_lote", id).order("id_producto");
    const cp = lo.compra || null;
    const mon = cp?.moneda === "USD" ? "USD" : "MXN";
    const tcN = num(cp?.tc) || 18, ad = num(cp?.aduana);
    const f = mon === "USD" ? tcN : 1;
    setEditId(id); setLoteSel(id); setLoteNombre(lo.nombre || ""); setNotas(lo.proveedor_notas || "");
    setFecha(lo.fecha || (ps || []).find((p) => p.fecha_compra)?.fecha_compra || "");
    setMoneda(mon); setTc(String(tcN)); setImpuesto(String(ad));
    setEnvio(cp?.envio ? String(cp.envio) : ""); setTaxUsa(cp?.taxUsa ? String(cp.taxUsa) : ""); setCruce(cp?.cruce ? String(cp.cruce) : "");
    setSinDatos(!cp);
    setLineas((ps || []).map((p) => {
      const unit = num(p.cantidad) > 0 ? num(p.costo_total) / num(p.cantidad) : 0;
      return {
        id_producto: p.id_producto, nombre: p.nombre || "", categoria: p.categoria || "Otro", cantidad: p.cantidad,
        // sin precio original guardado: se deduce del costo para que el total no cambie
        precio: String(p.precio_origen != null ? p.precio_origen : unit / (f * (1 + ad / 100))),
        estimado: p.precio_origen == null && !!cp,
        reventa: p.reventa ?? "", socio: p.socio || "Yo", quien: p.quien_puso_costo || "Yo",
      };
    }));
  }

  useEffect(() => {
    (async () => {
      const { data: l } = await sb.from("lotes").select("id_lote,nombre").order("id_lote", { ascending: false });
      setLotes(l || []);
      setSocios(await listaSocios(sb));
      const [c1, c2] = await Promise.all([sb.from("lotes").select("compra").limit(1), sb.from("productos").select("precio_origen").limit(1)]);
      setFaltaSQL(!!(c1.error || c2.error));
      const id = new URLSearchParams(window.location.search).get("lote");
      if (id) await cargarParaEditar(id);
    })();
  }, []);

  const factor = moneda === "USD" ? num(tc) : 1;
  const subtotales = lineas.map((l) => num(l.precio) * num(l.cantidad));
  const sumaSub = subtotales.reduce((a, b) => a + b, 0);
  const pctTax = moneda === "USD" ? num(taxUsa) / 100 : 0; // tax del vendedor en USA (solo compras en USD)
  const calculo = lineas.map((l, i) => {
    const envioParte = sumaSub > 0 ? (num(envio) * subtotales[i]) / sumaSub : 0; // envío prorrateado
    const conAduana = (subtotales[i] + envioParte) * factor * (1 + num(impuesto) / 100); // la aduana va sobre producto + envío
    const cruceParte = sumaSub > 0 ? (num(cruce) * subtotales[i]) / sumaSub : 0; // cruce USA–México prorrateado (en MXN, sin aduana)
    const total = Math.round((conAduana + subtotales[i] * pctTax * factor + cruceParte) * 100) / 100; // el tax de USA va sobre el producto
    return { total, unit: num(l.cantidad) > 0 ? total / num(l.cantidad) : 0 };
  });
  const totalLote = calculo.reduce((a, c) => a + c.total, 0);
  const desglose = {
    productos: sumaSub * factor, envio: num(envio) * factor, tax: sumaSub * pctTax * factor, cruce: sumaSub > 0 ? num(cruce) : 0,
    aduana: (sumaSub + num(envio)) * factor * (num(impuesto) / 100),
  };

  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const datosCompra = () => ({ moneda, tc: num(tc), aduana: num(impuesto), envio: num(envio), taxUsa: num(taxUsa), cruce: num(cruce) });

  async function guardarEdicion() {
    setMsg(null);
    if (!loteNombre.trim()) return setMsg({ ok: false, t: "Falta el nombre del lote" });
    if (moneda === "USD" && num(tc) <= 0) return setMsg({ ok: false, t: "Falta el tipo de cambio" });
    const mal = lineas.findIndex((l) => !l.nombre.trim() || num(l.cantidad) <= 0 || l.precio === "");
    if (mal >= 0) return setMsg({ ok: false, t: `Revisa el producto ${mal + 1}: nombre, cantidad y precio` });
    setGuardando(true);
    const { error: e1 } = await sb.from("lotes").update({ nombre: loteNombre.trim(), fecha: fecha || null, proveedor_notas: notas || null, ...(faltaSQL ? {} : { compra: datosCompra() }) }).eq("id_lote", editId);
    if (e1) { setGuardando(false); return setMsg({ ok: false, t: "No se guardó el lote: " + e1.message }); }
    const { data: pids } = await sb.from("productos").select("id_producto");
    const sig = siguiente((pids || []).map((x) => x.id_producto), "P", 3);
    let nuevos = 0;
    const rs = await Promise.all(lineas.map((l, i) => {
      const fila = {
        nombre: l.nombre.trim(), categoria: l.categoria, socio: l.socio.trim() || "Yo", quien_puso_costo: l.quien,
        cantidad: num(l.cantidad), costo_total: calculo[i].total, reventa: l.reventa === "" ? null : num(l.reventa), fecha_compra: fecha || null,
        ...(faltaSQL ? {} : { precio_origen: num(l.precio) }),
      };
      return l.id_producto
        ? sb.from("productos").update(fila).eq("id_producto", l.id_producto)
        : sb.from("productos").insert({ id_producto: sig(++nuevos), id_lote: editId, ...fila });
    }));
    setGuardando(false);
    const fallo = rs.find((r) => r.error);
    if (fallo) return setMsg({ ok: false, t: "Algunos productos no se guardaron: " + fallo.error.message });
    setMsg({ ok: true, t: `Guardado: ${editId} ahora cuesta ${mxn(totalLote)}` });
    await cargarParaEditar(editId);
  }

  async function ponerFoto(archivos) {
    try {
      const nuevas = [];
      for (const f of [...archivos]) nuevas.push(await comprimirImagen(f));
      setFotosNuevas((a) => [...a, ...nuevas].slice(0, MAX_FOTOS));
    } catch (x) { setMsg({ ok: false, t: x.message }); }
  }
  // Cmd/Ctrl + V: si lo copiado es una imagen, queda como la foto del pedido (solo al crear; al editar lo maneja FotoLote)
  useEffect(() => {
    if (editId) return;
    const alPegar = (e) => { const f = imagenDePegado(e); if (f) { e.preventDefault(); ponerFoto([f]); } };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [editId]);

  async function guardar() {
    if (editId) return guardarEdicion();
    setMsg(null);
    if (loteSel === "__nuevo" && !loteNombre.trim()) return setMsg({ ok: false, t: "Falta el nombre del lote" });
    if (moneda === "USD" && num(tc) <= 0) return setMsg({ ok: false, t: "Falta el tipo de cambio" });
    const mal = lineas.findIndex((l) => !l.nombre.trim() || num(l.cantidad) <= 0 || l.precio === "");
    if (mal >= 0) return setMsg({ ok: false, t: `Revisa el producto ${mal + 1}: nombre, cantidad y precio` });

    setGuardando(true);
    let idLote = loteSel, creado = false;
    if (loteSel === "__nuevo") {
      const { data: ids } = await sb.from("lotes").select("id_lote");
      idLote = siguiente((ids || []).map((x) => x.id_lote).filter((x) => /^L\d+$/.test(x)), "L", 2)(1);
      const { error } = await sb.from("lotes").insert({ id_lote: idLote, nombre: loteNombre.trim(), fecha: fecha || null, proveedor_notas: notas || null, ...(faltaSQL ? {} : { compra: datosCompra() }) });
      if (error) { setGuardando(false); return setMsg({ ok: false, t: "No se creó el lote: " + error.message }); }
      creado = true;
    }
    const { data: pids } = await sb.from("productos").select("id_producto");
    const sig = siguiente((pids || []).map((x) => x.id_producto), "P", 3);
    const filas = lineas.map((l, i) => ({
      id_producto: sig(i + 1),
      id_lote: idLote,
      nombre: l.nombre.trim(),
      categoria: l.categoria,
      socio: l.socio.trim() || "Yo",
      quien_puso_costo: l.quien,
      cantidad: num(l.cantidad),
      costo_total: calculo[i].total,
      reventa: l.reventa === "" ? null : num(l.reventa),
      fecha_compra: fecha || null,
      ...(faltaSQL ? {} : { precio_origen: num(l.precio) }),
    }));
    const { error } = await sb.from("productos").insert(filas);
    if (error) {
      if (creado) await sb.from("lotes").delete().eq("id_lote", idLote);
      setGuardando(false);
      return setMsg({ ok: false, t: "No se guardó: " + error.message });
    }
    let notaFoto = "";
    if (fotosNuevas.length) {
      let todas = fotosNuevas;
      if (!creado) { // lote existente: se suman a las que ya tiene
        const { data: ex } = await sb.from("lotes").select("foto").eq("id_lote", idLote).maybeSingle();
        todas = [...leerFotos(ex?.foto), ...fotosNuevas].slice(0, MAX_FOTOS);
      }
      const { error: ef } = await sb.from("lotes").update({ foto: guardarFotosTxt(todas) }).eq("id_lote", idLote);
      if (ef) notaFoto = " (las fotos no se guardaron: falta correr supabase/lote_foto.sql)";
    }
    setFotosNuevas([]);
    setGuardando(false);
    setMsg({ ok: true, t: `Guardado: ${filas.length} producto(s) en ${idLote} por ${mxn(totalLote)}${notaFoto}` });
    setLineas([linea()]); setEnvio(""); setTaxUsa(""); setLoteNombre(""); setNotas("");
    if (creado) setLoteSel(idLote);
    const { data: l } = await sb.from("lotes").select("id_lote,nombre").order("id_lote", { ascending: false });
    setLotes(l || []);
  }

  return (
    <div className="space-y-5">
      {editId ? (
        <div>
          <Volver a="/inventario" />
          <h1 className="mt-1 text-2xl font-semibold">Editar compra</h1>
          <p className="text-xs text-white/50">{editId} · cambia el tipo de cambio, la aduana, el envío o los precios y se recalcula el costo de todos sus productos.</p>
        </div>
      ) : <h1 className="text-2xl font-semibold">Nueva compra</h1>}
      {faltaSQL && (
        <div className="card space-y-2 border-amber-500/40 text-sm text-amber-300">
          <p>Para que la app recuerde el tipo de cambio, la aduana y los precios originales de cada compra, corre esto una vez en Supabase (SQL Editor). Mientras tanto puedes usar la pantalla, pero esos datos no se guardan.</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-white/80">{`alter table lotes add column if not exists compra jsonb;
alter table productos add column if not exists precio_origen numeric;`}</pre>
        </div>
      )}
      {editId && sinDatos && !faltaSQL && (
        <div className="card text-sm text-white/60">Esta compra se registró antes de guardar sus datos originales. La dejé en pesos, sin aduana, con los costos como están. Cambia a USD, pon el tipo de cambio, la aduana y el precio de cada producto, y se recalcula todo.</div>
      )}
      {editId && <FotoLote idLote={editId} />}
      {msg && <div className={`card text-sm ${msg.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{msg.t}</div>}

      <section className="card space-y-3">
        <h2 className="text-sm text-white/60">Lote</h2>
        {editId ? (
          <>
            <input className="input" placeholder="Nombre del lote" value={loteNombre} onChange={(e) => setLoteNombre(e.target.value)} />
            <input className="input" placeholder="Proveedor / notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </>
        ) : null}
        <select className={`input ${editId ? "hidden" : ""}`} value={loteSel} onChange={(e) => setLoteSel(e.target.value)}>
          <option value="__nuevo">+ Crear lote nuevo</option>
          {lotes.map((l) => <option key={l.id_lote} value={l.id_lote}>{l.id_lote} · {l.nombre}</option>)}
        </select>
        {!editId && loteSel === "__nuevo" && (
          <>
            <input className="input" placeholder="Nombre del lote (ej. Pedido Topps oct)" value={loteNombre} onChange={(e) => setLoteNombre(e.target.value)} />
            <input className="input" placeholder="Proveedor / notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </>
        )}
        {!editId && (
          <div className="text-sm text-white/60">
            <span>Fotos del pedido (opcional) · copia la captura y pégala con Cmd/Ctrl + V</span>
            <div className="mt-1 flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-white/15 px-3 py-2 text-amber-300">
                ＋ Agregar
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; ponerFoto(l); }} />
              </label>
              <button className="rounded-lg border border-white/15 px-3 py-2 text-amber-300" onClick={async () => { try { ponerFoto([await imagenDelPortapapeles()]); } catch (x) { setMsg({ ok: false, t: x.message }); } }}>📋 Pegar</button>
            </div>
            {fotosNuevas.length > 0 && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {fotosNuevas.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={f} alt={`Pedido ${i + 1}`} className="h-24 w-full rounded-lg object-cover object-top" />
                    <button className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-red-300" onClick={() => setFotosNuevas((a) => a.filter((_, j) => j !== i))}>Quitar</button>
                  </div>
                ))}
              </div>
            )}
            {loteSel !== "__nuevo" && fotosNuevas.length > 0 && <p className="mt-1 text-xs text-white/40">Se suman a las fotos de {loteSel}.</p>}
          </div>
        )}
        <label className="block text-sm text-white/60">Fecha de compra
          <input className="input mt-1" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
      </section>

      <section className="card space-y-3">
        <h2 className="text-sm text-white/60">Moneda y cargos</h2>
        <div className="grid grid-cols-2 gap-2">
          {["MXN", "USD"].map((m) => (
            <button key={m} onClick={() => setMoneda(m)}
              className={`rounded-lg border py-3 text-sm ${moneda === m ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15"}`}>Precios en {m}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {moneda === "USD" && (
            <label className="text-sm text-white/60">Tipo de cambio
              <input className="input mt-1" type="number" step="any" inputMode="decimal" value={tc} onChange={(e) => setTc(e.target.value)} />
            </label>
          )}
          <label className="text-sm text-white/60">Aduana a México (%)
            <input className="input mt-1" type="number" step="any" inputMode="decimal" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
          </label>
          <label className="text-sm text-white/60">Envío total ({moneda})
            <input className="input mt-1" type="number" step="any" inputMode="decimal" value={envio} onChange={(e) => setEnvio(e.target.value)} placeholder="se reparte entre productos" />
          </label>
          <label className="text-sm text-white/60">Cruce USA–México (MXN)
            <input className="input mt-1" type="number" step="any" inputMode="decimal" value={cruce} onChange={(e) => setCruce(e.target.value)} placeholder="lo que cobró el cruce" />
          </label>
          {moneda === "USD" && (
            <label className="text-sm text-white/60">Tax de USA (%)
              <input className="input mt-1" type="number" step="any" inputMode="decimal" value={taxUsa} onChange={(e) => setTaxUsa(e.target.value)} placeholder="el que cobra la tienda" />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-white/40">Aduana:</span>
          {[0, 8.35, 16, 20].map((p) => (
            <button key={p} onClick={() => setImpuesto(String(p))} className="rounded-full border border-white/15 px-3 py-1 text-white/60">{p}%</button>
          ))}
        </div>
        {moneda === "USD" && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-white/40">Tax USA:</span>
            {[0, 6.25, 7.25, 8.25, 10].map((p) => (
              <button key={p} onClick={() => setTaxUsa(String(p))} className="rounded-full border border-white/15 px-3 py-1 text-white/60">{p}%</button>
            ))}
          </div>
        )}
        {sumaSub > 0 && (
          <div className="space-y-1 border-t border-white/10 pt-3 text-sm">
            {[["Productos", desglose.productos], ["Envío", desglose.envio], ["Tax de USA", desglose.tax], ["Aduana a México", desglose.aduana], ["Cruce USA–México", desglose.cruce]].filter(([, v]) => v > 0.005).map(([l, v]) => (
              <div key={l} className="flex justify-between text-white/60"><span>{l}</span><span>{mxn(v)}</span></div>
            ))}
            <div className="flex justify-between font-semibold"><span>Total del lote</span><span className="text-amber-400">{mxn(totalLote)}</span></div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        {lineas.map((l, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center justify-between text-sm text-white/50">
              <span>Producto {i + 1}{l.id_producto ? ` · ${l.id_producto}` : editId ? " · nuevo" : ""}</span>
              {lineas.length > 1 && !l.id_producto && <button className="text-red-400" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>Quitar</button>}
            </div>
            <input className="input" placeholder="Nombre del producto" value={l.nombre} onChange={(e) => setL(i, "nombre", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={l.categoria} onChange={(e) => setL(i, "categoria", e.target.value)}>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input" type="number" min="1" inputMode="numeric" placeholder="Cantidad" value={l.cantidad} onChange={(e) => setL(i, "cantidad", e.target.value)} />
              <input className="input" type="number" step="any" inputMode="decimal" placeholder={`Precio c/u (${moneda})`} value={l.precio} onChange={(e) => setL(i, "precio", e.target.value)} />
              <input className="input" type="number" step="any" inputMode="decimal" placeholder="Reventa c/u (MXN)" value={l.reventa} onChange={(e) => setL(i, "reventa", e.target.value)} />
              <Combo value={l.socio} onChange={(v) => setL(i, "socio", v || "Yo")} vacio="Yo" placeholder="Socio (o Yo)"
                options={[...new Set(["Yo", ...socios, l.socio].filter(Boolean))].map((x) => ({ v: x, l: x }))} />
              <select className="input" value={l.quien} onChange={(e) => setL(i, "quien", e.target.value)}>
                <option value="Yo">Yo puse el costo</option>
                <option value="Socio">Socio puso el costo</option>
              </select>
            </div>
            {l.estimado && <p className="text-xs text-amber-300/80">Sin precio original guardado: lo estimé desde el costo. Revísalo.</p>}
            <div className="flex justify-between text-sm">
              <span className="text-white/50">{num(l.cantidad) > 1 ? `${mxn(calculo[i].unit)} c/u` : ""}</span>
              <span className="text-amber-400">Costo total {mxn(calculo[i].total)}</span>
            </div>
          </div>
        ))}
        <button className="w-full rounded-lg border border-dashed border-white/25 py-3 text-sm text-white/70" onClick={() => setLineas((ls) => [...ls, linea()])}>+ Agregar otro producto</button>
      </section>

      <div className="sticky bottom-20 space-y-2 rounded-xl border border-white/10 bg-[#171b21] p-4">
        <div className="flex justify-between"><span className="text-white/60">Total del lote</span><b className="text-amber-400">{mxn(totalLote)}</b></div>
        <button className="btn w-full" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : editId ? "Guardar cambios" : "Guardar compra"}</button>
      </div>
    </div>
  );
}
