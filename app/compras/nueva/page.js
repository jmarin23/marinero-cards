"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { listaSocios } from "@/lib/socios";
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
  const [lineas, setLineas] = useState([linea()]);
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: l } = await sb.from("lotes").select("id_lote,nombre").order("id_lote", { ascending: false });
      setLotes(l || []);
      setSocios(await listaSocios(sb));
    })();
  }, []);

  const factor = moneda === "USD" ? num(tc) : 1;
  const subtotales = lineas.map((l) => num(l.precio) * num(l.cantidad));
  const sumaSub = subtotales.reduce((a, b) => a + b, 0);
  const calculo = lineas.map((l, i) => {
    const base = subtotales[i] + (sumaSub > 0 ? (num(envio) * subtotales[i]) / sumaSub : 0); // envío prorrateado
    const total = Math.round(base * factor * (1 + num(impuesto) / 100) * 100) / 100;
    return { total, unit: num(l.cantidad) > 0 ? total / num(l.cantidad) : 0 };
  });
  const totalLote = calculo.reduce((a, c) => a + c.total, 0);

  const setL = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  async function guardar() {
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
      const { error } = await sb.from("lotes").insert({ id_lote: idLote, nombre: loteNombre.trim(), fecha: fecha || null, proveedor_notas: notas || null });
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
    }));
    const { error } = await sb.from("productos").insert(filas);
    if (error) {
      if (creado) await sb.from("lotes").delete().eq("id_lote", idLote);
      setGuardando(false);
      return setMsg({ ok: false, t: "No se guardó: " + error.message });
    }
    setGuardando(false);
    setMsg({ ok: true, t: `Guardado: ${filas.length} producto(s) en ${idLote} por ${mxn(totalLote)}` });
    setLineas([linea()]); setEnvio(""); setLoteNombre(""); setNotas("");
    if (creado) setLoteSel(idLote);
    const { data: l } = await sb.from("lotes").select("id_lote,nombre").order("id_lote", { ascending: false });
    setLotes(l || []);
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Nueva compra</h1>
      {msg && <div className={`card text-sm ${msg.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{msg.t}</div>}

      <section className="card space-y-3">
        <h2 className="text-sm text-white/60">Lote</h2>
        <select className="input" value={loteSel} onChange={(e) => setLoteSel(e.target.value)}>
          <option value="__nuevo">+ Crear lote nuevo</option>
          {lotes.map((l) => <option key={l.id_lote} value={l.id_lote}>{l.id_lote} · {l.nombre}</option>)}
        </select>
        {loteSel === "__nuevo" && (
          <>
            <input className="input" placeholder="Nombre del lote (ej. Pedido Topps oct)" value={loteNombre} onChange={(e) => setLoteNombre(e.target.value)} />
            <input className="input" placeholder="Proveedor / notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
          </>
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
          <label className="text-sm text-white/60">Aduana / impuesto (%)
            <input className="input mt-1" type="number" step="any" inputMode="decimal" value={impuesto} onChange={(e) => setImpuesto(e.target.value)} />
          </label>
          <label className="text-sm text-white/60">Envío total ({moneda})
            <input className="input mt-1" type="number" step="any" inputMode="decimal" value={envio} onChange={(e) => setEnvio(e.target.value)} placeholder="se reparte entre productos" />
          </label>
        </div>
        <div className="flex gap-2 text-xs">
          {[0, 8.35, 16, 20].map((p) => (
            <button key={p} onClick={() => setImpuesto(String(p))} className="rounded-full border border-white/15 px-3 py-1 text-white/60">{p}%</button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {lineas.map((l, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center justify-between text-sm text-white/50">
              <span>Producto {i + 1}</span>
              {lineas.length > 1 && <button className="text-red-400" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>Quitar</button>}
            </div>
            <input className="input" placeholder="Nombre del producto" value={l.nombre} onChange={(e) => setL(i, "nombre", e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={l.categoria} onChange={(e) => setL(i, "categoria", e.target.value)}>
                {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input" type="number" min="1" inputMode="numeric" placeholder="Cantidad" value={l.cantidad} onChange={(e) => setL(i, "cantidad", e.target.value)} />
              <input className="input" type="number" step="any" inputMode="decimal" placeholder={`Precio c/u (${moneda})`} value={l.precio} onChange={(e) => setL(i, "precio", e.target.value)} />
              <input className="input" type="number" step="any" inputMode="decimal" placeholder="Reventa c/u (MXN)" value={l.reventa} onChange={(e) => setL(i, "reventa", e.target.value)} />
              <input className="input" list="socios-compra" placeholder="Socio (o Yo)" value={l.socio} onChange={(e) => setL(i, "socio", e.target.value)} />
              <select className="input" value={l.quien} onChange={(e) => setL(i, "quien", e.target.value)}>
                <option value="Yo">Yo puse el costo</option>
                <option value="Socio">Socio puso el costo</option>
              </select>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/50">{num(l.cantidad) > 1 ? `${mxn(calculo[i].unit)} c/u` : ""}</span>
              <span className="text-amber-400">Costo total {mxn(calculo[i].total)}</span>
            </div>
          </div>
        ))}
        <datalist id="socios-compra">{socios.map((s) => <option key={s} value={s} />)}</datalist>
        <button className="w-full rounded-lg border border-dashed border-white/25 py-3 text-sm text-white/70" onClick={() => setLineas((ls) => [...ls, linea()])}>+ Agregar otro producto</button>
      </section>

      <div className="sticky bottom-20 space-y-2 rounded-xl border border-white/10 bg-[#171b21] p-4">
        <div className="flex justify-between"><span className="text-white/60">Total del lote</span><b className="text-amber-400">{mxn(totalLote)}</b></div>
        <button className="btn w-full" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar compra"}</button>
      </div>
    </div>
  );
}
