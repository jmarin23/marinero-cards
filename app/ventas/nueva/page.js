"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import Link from "next/link";
import VentaRapida from "@/components/VentaRapida";

// Vender = buscar lo que tienes en inventario, tocarlo, poner piezas/total y listo.
export default function NuevaVenta() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [productos, setProductos] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [prod, setProd] = useState(null);
  const [msg, setMsg] = useState(null);

  async function cargar() {
    const { data } = await sb.from("v_productos").select("id_producto,id_lote,nombre,categoria,inventario,costo_unitario,reventa")
      .gt("inventario", 0).neq("categoria", "Costo extra").order("nombre").range(0, 4999);
    setProductos(data || []);
  }
  useEffect(() => { cargar(); }, []);

  const cats = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort();
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return productos.filter((p) => (!cat || p.categoria === cat) && (!t || p.nombre.toLowerCase().includes(t)));
  }, [q, cat, productos]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vender</h1>
        <Link href="/ventas" className="text-sm text-amber-400">Últimas ventas →</Link>
      </div>
      <p className="text-sm text-white/50">Toca lo que vendiste. Solo aparece lo que tienes en inventario.</p>
      {msg && <div className="card border-emerald-500/40 text-emerald-300">{msg}</div>}

      <input className="input" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["", ...cats].map((c) => (
          <button key={c || "todas"} onClick={() => setCat(c)}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${cat === c ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{c || "Todas"}</button>
        ))}
      </div>

      <div className="space-y-2">
        {lista.map((p) => (
          <button key={p.id_producto} onClick={() => { setMsg(null); setProd(p); }}
            className="card flex w-full items-center justify-between gap-3 text-left active:bg-white/10">
            <span className="min-w-0">
              <span className="block truncate">{p.nombre}</span>
              <span className="block text-xs text-white/50">{p.categoria}{Number(p.reventa) ? ` · reventa ${mxn(p.reventa)}` : ""}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-lg font-semibold text-amber-400">{Number(p.inventario)}</span>
              <span className="block text-xs text-white/50">pzas</span>
            </span>
          </button>
        ))}
        {lista.length === 0 && <p className="text-sm text-white/50">Nada en inventario con ese filtro.</p>}
      </div>

      {prod && <VentaRapida prod={prod} onClose={() => setProd(null)} onSaved={(t) => { setProd(null); setMsg(t); cargar(); }} />}
    </div>
  );
}
