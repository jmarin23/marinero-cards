"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { notaLimpia } from "@/lib/tablas";
import { useRefrescar } from "@/lib/useRefrescar";

const n = (x) => Number(x || 0);
const norm = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dia = (f) => {
  if (!f) return "Sin fecha";
  const d = new Date(f + "T12:00:00");
  const hoy = new Date().toISOString().slice(0, 10);
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const txt = `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  return f === hoy ? `Hoy · ${txt}` : f === ayer ? `Ayer · ${txt}` : txt;
};
const COLOR = { Pagado: "text-emerald-400", "En espera": "text-sky-300", "Sin empatar": "text-amber-400", Revisar: "text-red-400", Reembolso: "text-white/40" };
const PENDIENTES = ["Sin empatar", "En espera", "Revisar"];

export default function UltimasVentas() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [ventas, setVentas] = useState(null);
  const [nombres, setNombres] = useState({});
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("Todas");
  const [msg, setMsg] = useState(null);

  async function cargar() {
    const [v, p, l] = await Promise.all([
      sb.from("ventas").select("*").range(0, 4999),
      sb.from("productos").select("id_producto,nombre,id_lote").range(0, 4999),
      sb.from("lotes").select("id_lote,nombre").range(0, 4999),
    ]);
    if (v.error) return setMsg(v.error.message);
    const nl = Object.fromEntries((l.data || []).map((x) => [x.id_lote, x.nombre]));
    setNombres(Object.fromEntries((p.data || []).map((x) => [x.id_producto, { nombre: x.nombre, lote: nl[x.id_lote] || "" }])));
    setVentas(v.data || []);
  }
  useEffect(() => { cargar(); }, []);
  useRefrescar(cargar);

  const lista = useMemo(() => {
    const pal = norm(q).split(/\s+/).filter(Boolean);
    return (ventas || [])
      .filter((v) => (filtro === "Todas" ? true : filtro === "Por buscar" ? PENDIENTES.includes(v.estado) : v.estado === filtro))
      .filter((v) => {
        const h = norm(`${v.id_venta} ${nombres[v.id_producto]?.nombre || ""} ${nombres[v.id_producto]?.lote || ""} ${v.cliente_notas || ""} ${v.canal || ""} ${v.estado} ${v.monto_neto}`);
        return pal.every((w) => h.includes(w));
      })
      .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.id_venta).localeCompare(String(a.id_venta)));
  }, [ventas, nombres, q, filtro]);

  const grupos = useMemo(() => {
    const g = [];
    for (const v of lista) {
      const k = v.fecha || "";
      if (!g.length || g[g.length - 1].k !== k) g.push({ k, filas: [] });
      g[g.length - 1].filas.push(v);
    }
    return g;
  }, [lista]);

  const porBuscar = (ventas || []).filter((v) => PENDIENTES.includes(v.estado));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Últimas ventas</h1>
        <Link href="/ventas/nueva" className="text-sm text-amber-400">+ Nueva venta</Link>
      </div>
      <p className="-mt-2 text-xs text-white/40">Las más recientes primero, para revisarlas contra TikTok. Los datos que ves son los que tú capturaste.</p>
      {msg && <div className="card text-sm text-red-300">{msg}</div>}

      <input className="input" placeholder="Buscar por producto, monto, ID, nota…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {["Todas", "Por buscar", "Pagado", "En espera", "Sin empatar"].map((f) => (
          <button key={f} onClick={() => setFiltro(f)} className={`rounded-full border px-3 py-1 ${filtro === f ? "border-amber-500 text-amber-300" : "border-white/10 text-white/60"}`}>
            {f}{f === "Por buscar" && porBuscar.length ? ` (${porBuscar.length})` : ""}
          </button>
        ))}
        <span className="ml-auto text-white/40">{lista.length}</span>
      </div>
      {filtro === "Por buscar" && <p className="text-xs text-white/40">Son las que aún no están Pagadas: Sin empatar, En espera o Revisar. Ahí es donde vale la pena buscar en TikTok.</p>}

      {ventas === null ? <div className="text-sm text-white/50">Cargando…</div> : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <section key={g.k || "sin"} className="space-y-1">
              <div className="flex justify-between text-xs uppercase tracking-wide text-white/50">
                <span>{dia(g.k)}</span>
                <span>{g.filas.length} · {mxn(g.filas.filter((v) => v.estado !== "Reembolso").reduce((t, v) => t + n(v.monto_neto), 0))}</span>
              </div>
              {g.filas.map((v) => {
                const p = nombres[v.id_producto];
                const nota = notaLimpia(v.cliente_notas);
                return (
                  <div key={v.id_venta} className="card !py-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div>{p?.nombre || v.id_producto || nota.split("|")[0].trim() || "Venta suelta"}</div>
                        <div className="text-xs text-white/50">
                          {v.id_venta} · {n(v.cantidad)} pza{n(v.cantidad) === 1 ? "" : "s"}{p?.lote ? ` · ${p.lote}` : ""} · {v.canal || "sin canal"}
                          {nota && v.id_producto ? ` · ${nota}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div>{mxn(v.monto_neto)}</div>
                        <div className={`text-xs ${COLOR[v.estado] || "text-white/50"}`}>{v.estado}</div>
                      </div>
                    </div>
                    <Link href={`/datos/ventas?q=${v.id_venta}`} className="text-xs text-white/40 underline">Editar</Link>
                  </div>
                );
              })}
            </section>
          ))}
          {!grupos.length && <div className="card text-sm text-white/50">Nada con ese filtro.</div>}
        </div>
      )}
    </div>
  );
}
