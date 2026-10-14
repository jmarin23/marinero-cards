"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

const CANALES = ["TikTok", "Externa", "Mercado Libre"];
const ESTADOS = ["Sin empatar", "En espera", "Pagado", "Cobrado", "Reembolso", "Revisar"];

// Las notas que venían del Excel mezclan el cliente con avisos tipo "Revisar: 4 montos vs 3 vendidas".
// Aquí se separan: el aviso sale como etiqueta y la nota queda limpia.
function separar(nota) {
  const t = String(nota || "");
  const m = t.match(/(?:^|\s*\|\s*)(Revisar:[^|]*)/);
  const aviso = m ? m[1].trim() : "";
  const limpia = t.replace(/(?:^|\s*\|\s*)Revisar:[^|]*/, "").replace(/^\s*\|\s*/, "").trim();
  return { aviso, limpia };
}
const num = (x) => (x === "" || x == null ? 0 : Number(x));

export default function Revisar() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [ventas, setVentas] = useState([]);
  const [prods, setProds] = useState([]);
  const [tab, setTab] = useState("corregir");
  const [ed, setEd] = useState({});
  const [msg, setMsg] = useState(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    const { data, error } = await sb.from("ventas").select("*, productos(nombre)")
      .or('estado.in.(Revisar,"Sin empatar"),canal.is.null,id_producto.is.null').order("id_producto", { nullsFirst: true }).order("id_venta").range(0, 4999);
    if (error) setMsg({ ok: false, t: error.message });
    setVentas(data || []);
    setCargando(false);
  }
  useEffect(() => {
    cargar();
    sb.from("productos").select("id_producto,id_lote,nombre").order("id_producto").range(0, 4999).then(({ data }) => setProds(data || []));
  }, []);

  const etiqueta = (p) => `${p.id_producto} · ${p.nombre}`;
  const set = (id, k, v) => setEd((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const val = (v, k, base) => (ed[v.id_venta]?.[k] !== undefined ? ed[v.id_venta][k] : base !== undefined ? base : v[k] ?? "");

  async function guardar(v, extra = {}) {
    const c = { ...ed[v.id_venta], ...extra };
    const cambios = {};
    if (c.productoTxt !== undefined) {
      const p = prods.find((x) => etiqueta(x) === c.productoTxt);
      if (c.productoTxt === "") cambios.id_producto = null;
      else if (!p) return setMsg({ ok: false, t: `Elige un producto de la lista (${v.id_venta})` });
      else { cambios.id_producto = p.id_producto; cambios.id_lote = p.id_lote; }
    }
    for (const k of ["canal", "estado"]) if (c[k] !== undefined) cambios[k] = c[k] === "" ? null : c[k];
    if (c.nota !== undefined) cambios.cliente_notas = c.nota.trim() || null;
    if (c.quitarAviso) { const { limpia } = separar(v.cliente_notas); cambios.cliente_notas = (c.nota !== undefined ? c.nota.trim() : limpia) || null; }
    if (c.monto_neto !== undefined) cambios.monto_neto = num(c.monto_neto);
    if (c.cantidad !== undefined) {
      if (!(num(c.cantidad) > 0)) return setMsg({ ok: false, t: `${v.id_venta}: las piezas deben ser 1 o más` });
      cambios.cantidad = num(c.cantidad);
    }
    if (!Object.keys(cambios).length) return;
    const { error } = await sb.from("ventas").update(cambios).eq("id_venta", v.id_venta);
    if (error) return setMsg({ ok: false, t: `${v.id_venta}: ${error.message}` });
    setEd((e) => { const n = { ...e }; delete n[v.id_venta]; return n; });
    setMsg({ ok: true, t: `${v.id_venta} guardada` });
    cargar();
  }

  async function borrar(v) {
    if (!confirm(`¿Borrar la venta ${v.id_venta}?`)) return;
    const { error } = await sb.from("ventas").delete().eq("id_venta", v.id_venta);
    if (error) return setMsg({ ok: false, t: error.message });
    setMsg({ ok: true, t: `${v.id_venta} borrada` }); cargar();
  }

  const conInfo = ventas.map((v) => {
    const { aviso, limpia } = separar(v.cliente_notas);
    const problema = v.estado === "Revisar" || !v.id_producto || !v.canal || !(Number(v.cantidad) > 0) || !!aviso;
    return { ...v, aviso, limpia, problema };
  });
  const vistas = {
    corregir: conInfo.filter((v) => v.problema),
    empatar: conInfo.filter((v) => v.estado === "Sin empatar" && !v.problema),
    todas: conInfo,
  };
  const lista = vistas[tab];

  // agrupa por producto: una cabecera con piezas y total, y debajo cada venta en una línea compacta
  const grupos = [];
  lista.forEach((v) => {
    const k = v.id_producto || "—";
    let g = grupos.find((x) => x.k === k);
    if (!g) grupos.push((g = { k, nombre: v.id_producto ? `${v.id_producto} · ${v.productos?.nombre || ""}` : "Sin producto", ventas: [] }));
    g.ventas.push(v);
  });

  const tabs = [["corregir", "Por corregir"], ["empatar", "Por empatar con TikTok"], ["todas", "Todas"]];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Revisar ventas</h1>
      <p className="text-sm text-white/50">
        <b className="text-white/70">Por corregir</b>: ventas sin producto, sin canal o con aviso. <b className="text-white/70">Por empatar</b>: ya las capturaste, falta que entre el pago de TikTok (se empatan solas al importar).
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${tab === k ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{l} ({vistas[k].length})</button>
        ))}
      </div>
      {msg && <div className={`card text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.t}</div>}
      {cargando && <p className="text-white/50">Cargando…</p>}
      {!cargando && lista.length === 0 && <p className="card text-emerald-300">Nada por aquí.</p>}

      {grupos.map((g) => {
        const pzas = g.ventas.reduce((t, v) => t + Number(v.cantidad || 0), 0);
        const total = g.ventas.reduce((t, v) => t + Number(v.monto_neto || 0), 0);
        return (
          <details key={g.k} open={tab === "corregir" || g.ventas.length <= 3} className="card !p-0">
            <summary className="flex cursor-pointer items-center justify-between gap-3 p-3">
              <span className="min-w-0 truncate text-sm font-medium">{g.nombre}</span>
              <span className="shrink-0 text-right text-xs text-white/60">
                <b className="text-sm text-white">{pzas} pzas</b> · {g.ventas.length} ventas · {mxn(total)}
              </span>
            </summary>
            <div className="divide-y divide-white/10 border-t border-white/10">
              {g.ventas.map((v) => {
                const sucia = !!ed[v.id_venta];
                const cant = val(v, "cantidad");
                const monto = val(v, "monto_neto");
                const cu = num(cant) > 0 ? num(monto) / num(cant) : 0;
                const prodTxt = ed[v.id_venta]?.productoTxt !== undefined ? ed[v.id_venta].productoTxt : v.id_producto ? etiqueta({ id_producto: v.id_producto, nombre: v.productos?.nombre || "" }) : "";
                return (
                  <div key={v.id_venta} className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-white/50">
                      <span>{v.id_venta} · {v.fecha || "sin fecha"} · {v.canal || <span className="text-amber-300">sin canal</span>} · {v.estado}</span>
                      <button className="text-red-400" onClick={() => borrar(v)}>Borrar</button>
                    </div>
                    {v.aviso && (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                        <span>{v.aviso}</span>
                        <button className="shrink-0 underline" onClick={() => guardar(v, { quitarAviso: true })}>Ya lo revisé</button>
                      </div>
                    )}
                    {!v.id_producto && (
                      <input className="input" list="productos-revisar" placeholder="Producto (escribe para buscar)" value={prodTxt} onChange={(e) => set(v.id_venta, "productoTxt", e.target.value)} />
                    )}
                    <div className="grid grid-cols-[5.5rem_1fr_1fr] items-end gap-2">
                      <label className="text-xs text-white/50">Piezas
                        <input className="input mt-1 text-center text-lg font-semibold" type="number" min="1" step="1" inputMode="numeric" value={cant} onChange={(e) => set(v.id_venta, "cantidad", e.target.value)} />
                      </label>
                      <label className="text-xs text-white/50">Total (MXN)
                        <input className="input mt-1" type="number" step="any" inputMode="decimal" value={monto} onChange={(e) => set(v.id_venta, "monto_neto", e.target.value)} />
                      </label>
                      <div className="pb-2 text-right text-xs text-white/50">
                        c/u<div className="text-base font-semibold text-amber-400">{mxn(cu)}</div>
                      </div>
                    </div>
                    <input className="input" placeholder="Cliente" value={val(v, "nota", v.limpia)} onChange={(e) => set(v.id_venta, "nota", e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <select className="input" value={val(v, "canal")} onChange={(e) => set(v.id_venta, "canal", e.target.value)}>
                        <option value="">Sin canal</option>
                        {CANALES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <select className="input" value={val(v, "estado")} onChange={(e) => set(v.id_venta, "estado", e.target.value)}>
                        {ESTADOS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button className="btn !py-2 text-sm" disabled={!sucia} onClick={() => guardar(v)}>Guardar</button>
                      {v.estado !== "Pagado" && <button className="rounded-lg border border-emerald-500/50 px-3 py-2 text-sm text-emerald-300" onClick={() => guardar(v, { estado: "Pagado" })}>Pagado</button>}
                      {v.estado !== "Cobrado" && <button className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/70" onClick={() => guardar(v, { estado: "Cobrado" })}>Cobrado</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
      <datalist id="productos-revisar">{prods.map((p) => <option key={p.id_producto} value={etiqueta(p)} />)}</datalist>
    </div>
  );
}
