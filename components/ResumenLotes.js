"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { useRefrescar } from "@/lib/useRefrescar";

const n = (x) => Number(x || 0);

// Una tarjeta por lote con lo que importa del inventario: cuántas piezas quedan, a cuánto, y qué ganancia dejaría.
export default function ResumenLotes({ onVerLote }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [datos, setDatos] = useState(null);
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);
  const [editando, setEditando] = useState(null); // id del lote que se está renombrando
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [err, setErr] = useState("");
  const [borrando, setBorrando] = useState(null); // { id, nombre, prods, ventas, monto, pagos } esperando confirmación
  const [ocupado, setOcupado] = useState(false);

  const cargar = async () => {
    const [p, l] = await Promise.all([
      sb.from("v_productos").select("id_producto,id_lote,categoria,cantidad,inventario,vendidas,costo_total,costo_inventario,costo_unitario,reventa,venta_total").range(0, 4999),
      sb.from("v_lotes").select("id_lote,nombre,fecha,venta").order("id_lote", { ascending: false }).range(0, 4999),
    ]);
    setDatos({ prods: p.data || [], lotes: l.data || [] });
  };
  useEffect(() => { cargar(); }, [sb]);
  useRefrescar(() => { if (!editando) cargar(); });

  const filas = useMemo(() => {
    if (!datos) return [];
    return datos.lotes.map((l) => {
      const ps = datos.prods.filter((p) => p.id_lote === l.id_lote);
      const reales = ps.filter((p) => p.categoria !== "Costo extra");
      const disp = reales.reduce((t, p) => t + n(p.inventario), 0);
      const costoLote = ps.reduce((t, p) => t + n(p.costo_total), 0);
      const reventaDisp = reales.reduce((t, p) => t + n(p.inventario) * n(p.reventa || p.costo_unitario), 0);
      const sinPrecio = reales.filter((p) => n(p.inventario) > 0 && !n(p.reventa)).length;
      const vendido = n(l.venta);
      return {
        id: l.id_lote, nombre: l.nombre, productos: reales.length,
        piezas: reales.reduce((t, p) => t + n(p.cantidad), 0), disp,
        vendidas: reales.reduce((t, p) => t + n(p.vendidas), 0),
        costoLote, vendido, costoDisp: reales.reduce((t, p) => t + n(p.costo_inventario), 0),
        reventaDisp, sinPrecio, ganEstimada: vendido + reventaDisp - costoLote,
      };
    });
  }, [datos]);

  async function renombrar(id) {
    const nombre = nombreNuevo.trim();
    if (!nombre) return setErr("Escribe un nombre");
    setErr("");
    const { error } = await sb.from("lotes").update({ nombre }).eq("id_lote", id);
    if (error) return setErr(error.message);
    setDatos((d) => ({ ...d, lotes: d.lotes.map((l) => (l.id_lote === id ? { ...l, nombre } : l)) }));
    setEditando(null);
  }
  // Cuenta qué se llevaría el lote antes de borrarlo
  async function pedirBorrar(x) {
    setErr(""); setOcupado(true);
    const ids = (datos.prods.filter((p) => p.id_lote === x.id)).map((p) => p.id_producto);
    const ventasQ = [sb.from("ventas").select("id_venta,monto_neto").eq("id_lote", x.id).range(0, 4999)];
    const pagosQ = [sb.from("pagos_socios").select("id_pago").eq("id_lote", x.id).range(0, 4999)];
    if (ids.length) {
      ventasQ.push(sb.from("ventas").select("id_venta,monto_neto").in("id_producto", ids).range(0, 4999));
      pagosQ.push(sb.from("pagos_socios").select("id_pago").in("id_producto", ids).range(0, 4999));
    }
    const rs = await Promise.all([...ventasQ, ...pagosQ]);
    setOcupado(false);
    const fallo = rs.find((r) => r.error);
    if (fallo) return setErr(fallo.error.message);
    const vs = new Map(), pg = new Set();
    rs.slice(0, ventasQ.length).forEach((r) => (r.data || []).forEach((v) => vs.set(v.id_venta, n(v.monto_neto))));
    rs.slice(ventasQ.length).forEach((r) => (r.data || []).forEach((g) => pg.add(g.id_pago)));
    setBorrando({ id: x.id, nombre: x.nombre, ids, ventas: vs.size, monto: [...vs.values()].reduce((a, b) => a + b, 0), pagos: pg.size });
  }
  async function borrarLote() {
    const b = borrando; if (!b) return;
    setOcupado(true); setErr("");
    // orden: primero lo que depende (ventas, pagos), luego productos, al final el lote
    const pasos = [
      () => sb.from("ventas").delete().eq("id_lote", b.id),
      () => sb.from("pagos_socios").delete().eq("id_lote", b.id),
      ...(b.ids.length ? [
        () => sb.from("ventas").delete().in("id_producto", b.ids),
        () => sb.from("pagos_socios").delete().in("id_producto", b.ids),
        () => sb.from("productos").delete().in("id_producto", b.ids),
      ] : []),
      () => sb.from("lotes").delete().eq("id_lote", b.id),
    ];
    for (const paso of pasos) {
      const { error } = await paso();
      if (error) { setOcupado(false); setErr("No se pudo borrar: " + error.message + ". Puede que haya quedado a medias; recarga y revisa."); await cargar(); return; }
    }
    setOcupado(false); setBorrando(null); cargar();
  }
  const sinNombre = (x) => !x.nombre || x.nombre.trim() === x.id || /^lote\s*[a-z]?\d*$/i.test(x.nombre.trim());

  const t = (txt) => (txt || "").toLowerCase();
  const vistas = filas.filter((x) => (todos || x.disp > 0) && (!q.trim() || t(x.nombre).includes(t(q.trim())) || t(x.id).includes(t(q.trim()))));
  const tot = vistas.reduce((a, x) => ({ disp: a.disp + x.disp, piezas: a.piezas + x.piezas, costoDisp: a.costoDisp + x.costoDisp, reventaDisp: a.reventaDisp + x.reventaDisp }), { disp: 0, piezas: 0, costoDisp: 0, reventaDisp: 0 });

  if (!datos) return <p className="text-white/50">Cargando…</p>;
  const Dato = ({ l, v, cls = "" }) => (<div><div className="text-[11px] uppercase tracking-wide text-white/50">{l}</div><div className={`font-semibold ${cls}`}>{v}</div></div>);

  return (
    <div className="space-y-3">
      <input className="input" placeholder="Buscar lote…" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="flex items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Mostrar también los lotes agotados
      </label>
      <div className="grid grid-cols-3 gap-2">
        <div className="card !p-3"><div className="text-[11px] uppercase tracking-wide text-white/50">Disponibles</div><div className="font-bold text-amber-400">{tot.disp.toLocaleString("es-MX")}</div></div>
        <div className="card !p-3"><div className="text-[11px] uppercase tracking-wide text-white/50">A costo</div><div className="font-bold text-amber-400">{mxn(tot.costoDisp)}</div></div>
        <div className="card !p-3"><div className="text-[11px] uppercase tracking-wide text-white/50">A reventa</div><div className="font-bold text-amber-400">{mxn(tot.reventaDisp)}</div></div>
      </div>
      <p className="text-xs text-white/40">{vistas.length} lotes · toca uno para ver sus productos</p>
      {vistas.map((x) => (
        <div key={x.id} className="card space-y-3 active:bg-transparent">
          <button onClick={() => onVerLote(x.id)} className="block w-full space-y-3 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{x.nombre}</div>
                <div className="text-xs text-white/50">{x.id} · {x.productos} producto{x.productos === 1 ? "" : "s"}{sinNombre(x) && <span className="text-amber-300"> · sin nombre</span>}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-2xl font-bold text-amber-400">{x.disp}</div>
                <div className="text-xs text-white/50">de {x.piezas} disponibles</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Dato l="Costo del lote" v={mxn(x.costoLote)} />
              <Dato l="Vendido" v={mxn(x.vendido)} />
              <Dato l="Disponible a costo" v={mxn(x.costoDisp)} />
              <Dato l="Disponible a reventa" v={mxn(x.reventaDisp)} />
              <Dato l="Ganancia si vendes todo" v={`${mxn(x.ganEstimada)}${x.costoLote > 0 ? ` · ${x.ganEstimada >= 0 ? "+" : ""}${Math.round((x.ganEstimada / x.costoLote) * 100)}%` : ""}`} cls={x.ganEstimada >= 0 ? "text-emerald-400" : "text-red-400"} />
              <Dato l="Piezas vendidas" v={x.vendidas.toLocaleString("es-MX")} />
            </div>
            {x.sinPrecio > 0 && <div className="text-xs text-amber-300/80">{x.sinPrecio} producto{x.sinPrecio === 1 ? "" : "s"} sin precio de reventa (se cuenta a costo)</div>}
          </button>
          {editando === x.id ? (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <input className="input" autoFocus placeholder="Nombre del lote" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") renombrar(x.id); if (e.key === "Escape") setEditando(null); }} />
              {err && <p className="text-sm text-red-300">{err}</p>}
              <div className="flex gap-2">
                <button className="btn flex-1 !py-2" onClick={() => renombrar(x.id)}>Guardar nombre</button>
                <button className="rounded-lg border border-white/20 px-4 text-sm" onClick={() => setEditando(null)}>Cancelar</button>
              </div>
            </div>
          ) : borrando?.id === x.id ? (
            <div className="space-y-2 border-t border-red-500/30 pt-3 text-sm">
              <p className="text-red-300">
                Vas a borrar <b>{x.nombre}</b> y con él: {borrando.ids.length} producto{borrando.ids.length === 1 ? "" : "s"}
                {borrando.ventas > 0 && <>, <b>{borrando.ventas} venta{borrando.ventas === 1 ? "" : "s"} ({mxn(borrando.monto)})</b></>}
                {borrando.pagos > 0 && <>, {borrando.pagos} pago{borrando.pagos === 1 ? "" : "s"} a socios</>}. No se puede deshacer.
              </p>
              {err && <p className="text-red-300">{err}</p>}
              <div className="flex gap-2">
                <button disabled={ocupado} className="flex-1 rounded-lg border border-red-500/60 py-2 text-red-300 active:bg-red-500/10" onClick={borrarLote}>{ocupado ? "Borrando…" : "Sí, borrar todo"}</button>
                <button className="rounded-lg border border-white/20 px-4 text-sm" onClick={() => setBorrando(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-sm">
              {err && <p className="w-full text-red-300">{err}</p>}
              <button className="text-amber-300" onClick={() => { setErr(""); setBorrando(null); setNombreNuevo(x.nombre || ""); setEditando(x.id); }}>✎ Renombrar este lote</button>
              <button disabled={ocupado} className="text-red-400" onClick={() => pedirBorrar(x)}>🗑 Borrar lote</button>
            </div>
          )}
        </div>
      ))}
      {vistas.length === 0 && <p className="text-sm text-white/50">No hay lotes con inventario.</p>}
    </div>
  );
}
