"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

const CANALES = ["TikTok", "Externa", "Mercado Libre"];
const ESTADOS = ["Sin empatar", "En espera", "Pagado", "Cobrado", "Reembolso", "Revisar"];
const motivoDe = (v) => (v.estado === "Revisar" ? "Revisar" : v.estado === "Sin empatar" ? "Sin empatar" : "Sin canal");

export default function Revisar() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [ventas, setVentas] = useState([]);
  const [prods, setProds] = useState([]);
  const [filtro, setFiltro] = useState("Todas");
  const [ed, setEd] = useState({});          // cambios pendientes por id_venta
  const [msg, setMsg] = useState(null);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    const { data, error } = await sb.from("ventas").select("*, productos(nombre)")
      .or('estado.in.(Revisar,"Sin empatar"),canal.is.null').order("fecha", { ascending: false, nullsFirst: false }).range(0, 4999);
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
  const val = (v, k) => (ed[v.id_venta]?.[k] !== undefined ? ed[v.id_venta][k] : v[k] ?? "");

  async function guardar(v, extra = {}) {
    const c = { ...ed[v.id_venta], ...extra };
    const cambios = {};
    if (c.productoTxt !== undefined) {
      const p = prods.find((x) => etiqueta(x) === c.productoTxt);
      if (c.productoTxt === "") { cambios.id_producto = null; }
      else if (!p) return setMsg({ ok: false, t: `Elige un producto de la lista (${v.id_venta})` });
      else { cambios.id_producto = p.id_producto; cambios.id_lote = p.id_lote; }
    }
    for (const k of ["canal", "estado", "cliente_notas"]) if (c[k] !== undefined) cambios[k] = c[k] === "" ? null : c[k];
    if (c.monto_neto !== undefined) cambios.monto_neto = Number(c.monto_neto);
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

  const conMotivo = ventas.map((v) => ({ ...v, motivo: motivoDe(v) }));
  const motivos = ["Todas", "Revisar", "Sin empatar", "Sin canal"];
  const lista = conMotivo.filter((v) => filtro === "Todas" || v.motivo === filtro);
  const cuenta = (m) => conMotivo.filter((v) => m === "Todas" || v.motivo === m).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Revisar ventas</h1>
      <p className="text-sm text-white/50">Ventas que importaste sin producto, que aún no empatan con un pago de TikTok, o que no tienen canal. Corrige y guarda cada una.</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {motivos.map((m) => (
          <button key={m} onClick={() => setFiltro(m)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${filtro === m ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{m} ({cuenta(m)})</button>
        ))}
      </div>
      {msg && <div className={`card text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.t}</div>}
      {cargando && <p className="text-white/50">Cargando…</p>}
      {!cargando && lista.length === 0 && <p className="card text-emerald-300">Nada por revisar.</p>}

      {lista.map((v) => {
        const sucia = !!ed[v.id_venta];
        const prodTxt = ed[v.id_venta]?.productoTxt !== undefined ? ed[v.id_venta].productoTxt : v.id_producto ? etiqueta({ id_producto: v.id_producto, nombre: v.productos?.nombre || "" }) : "";
        return (
          <div key={v.id_venta} className="card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-xs text-white/50">
                <div>{v.id_venta} · {v.fecha || "sin fecha"} · <span className="text-amber-300">{v.motivo}</span></div>
                {v.id_pedido_tiktok && <div className="truncate">Pedido TikTok {v.id_pedido_tiktok}</div>}
              </div>
              <div className="shrink-0 font-semibold text-amber-400">{mxn(v.monto_neto)}</div>
            </div>
            {v.cliente_notas && !ed[v.id_venta]?.cliente_notas && <p className="text-xs text-white/60">{v.cliente_notas}</p>}

            <input className="input" list="productos-revisar" placeholder="Producto (escribe para buscar)" value={prodTxt} onChange={(e) => set(v.id_venta, "productoTxt", e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <select className="input" value={val(v, "canal")} onChange={(e) => set(v.id_venta, "canal", e.target.value)}>
                <option value="">Sin canal</option>
                {CANALES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select className="input" value={val(v, "estado")} onChange={(e) => set(v.id_venta, "estado", e.target.value)}>
                {ESTADOS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input" type="number" step="any" inputMode="decimal" value={val(v, "monto_neto")} onChange={(e) => set(v.id_venta, "monto_neto", e.target.value)} />
              <input className="input" placeholder="Cliente / notas" value={val(v, "cliente_notas")} onChange={(e) => set(v.id_venta, "cliente_notas", e.target.value)} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn !py-2 text-sm" disabled={!sucia} onClick={() => guardar(v)}>Guardar</button>
              {v.estado !== "Pagado" && <button className="rounded-lg border border-emerald-500/50 px-3 py-2 text-sm text-emerald-300" onClick={() => guardar(v, { estado: "Pagado" })}>Marcar Pagado</button>}
              {v.estado !== "Cobrado" && <button className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white/70" onClick={() => guardar(v, { estado: "Cobrado" })}>Marcar Cobrado</button>}
              <button className="ml-auto text-sm text-red-400" onClick={() => borrar(v)}>Borrar</button>
            </div>
          </div>
        );
      })}
      <datalist id="productos-revisar">{prods.map((p) => <option key={p.id_producto} value={etiqueta(p)} />)}</datalist>
    </div>
  );
}
