"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { notaLimpia } from "@/lib/tablas";
import { useRefrescar } from "@/lib/useRefrescar";

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lunes = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const suma = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function periodos() {
  const hoy = new Date();
  const l = lunes(hoy);
  const mesPasado1 = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const mesPasadoN = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  return {
    semana: { l: "Esta semana", a: ymd(l), b: ymd(suma(l, 6)) },
    pasada: { l: "La semana pasada", a: ymd(suma(l, -7)), b: ymd(suma(l, -1)) },
    mes: { l: "El mes pasado", a: ymd(mesPasado1), b: ymd(mesPasadoN) },
    todo: { l: "Todo", a: "", b: "" },
  };
}

// Tarjetas parecidas a las de TikTok Shop: cada una agrupa ventas por estado
const TARJETAS = [
  { k: "neto", t: "Ingresos netos", nota: "Todo lo vendido en el periodo", estados: null },
  { k: "pagado", t: "Pagado", nota: "Ya te llegó el dinero", estados: ["Pagado", "Cobrado"] },
  { k: "espera", t: "En espera", nota: "TikTok ya lo tiene, aún no te paga", estados: ["En espera"] },
  { k: "sin", t: "Sin empatar", nota: "Falta que entre en un reporte", estados: ["Sin empatar", "Revisar"] },
];

export default function PanelPagos() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const P = useMemo(periodos, []);
  const [ventas, setVentas] = useState(null);
  const [per, setPer] = useState("todo");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tarj, setTarj] = useState("neto");
  const [canal, setCanal] = useState("");
  const [max, setMax] = useState(12);

  const cargar = () => sb.from("ventas").select("id_venta,fecha,monto_neto,cantidad,estado,canal,id_producto,cliente_notas,productos(nombre)").range(0, 4999)
    .then(({ data }) => setVentas(data || []));
  useEffect(() => { cargar(); }, [sb]);
  useRefrescar(cargar);

  const rango = per === "rango" ? { a: desde, b: hasta } : P[per];
  const enPeriodo = (ventas || []).filter((v) => {
    if (canal && v.canal !== canal) return false;
    if (per === "todo") return true;
    if (!v.fecha) return false;
    return (!rango.a || v.fecha >= rango.a) && (!rango.b || v.fecha <= rango.b);
  });
  const sinFecha = (ventas || []).filter((v) => !v.fecha && (!canal || v.canal === canal)).length;
  const validas = enPeriodo.filter((v) => v.estado !== "Reembolso");
  const total = (lista) => lista.reduce((t, v) => t + Number(v.monto_neto || 0), 0);
  const delaTarjeta = (t) => (t.estados ? validas.filter((v) => t.estados.includes(v.estado)) : validas);
  const actual = TARJETAS.find((t) => t.k === tarj);
  const lista = [...delaTarjeta(actual)].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")) || String(b.id_venta).localeCompare(String(a.id_venta)));
  const canales = [...new Set((ventas || []).map((v) => v.canal).filter(Boolean))];
  const nombre = (v) => v.productos?.nombre || notaLimpia(v.cliente_notas).split("|")[0].trim() || "Venta suelta";
  const chip = (act) => `shrink-0 rounded-lg border px-3 py-2 text-sm ${act ? "border-amber-500 bg-amber-500/15 text-amber-300" : "border-white/15 text-white/60"}`;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <h2 className="font-semibold">Resumen de pagos</h2>
        <select className="input !w-auto !py-1 text-sm" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos los canales</option>
          {canales.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TARJETAS.map((t) => {
          const l = delaTarjeta(t);
          const act = tarj === t.k;
          return (
            <button key={t.k} onClick={() => { setTarj(t.k); setMax(12); }}
              className={`card text-left transition ${act ? "!border-amber-500 bg-amber-500/10" : ""}`}>
              <div className="text-sm text-white/70">{t.t}</div>
              <div className="mt-1 text-xl font-bold">{fmt.format(total(l))}</div>
              <div className="mt-1 text-xs text-white/50">{l.length} ventas · {t.nota}</div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["semana", "pasada", "mes", "todo"].map((k) => (
          <button key={k} className={chip(per === k)} onClick={() => { setPer(k); setMax(12); }}>{P[k].l}</button>
        ))}
        <button className={chip(per === "rango")} onClick={() => setPer("rango")}>Fechas…</button>
      </div>
      {per === "rango" ? (
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      ) : per !== "todo" ? (
        <p className="text-xs text-white/40">{rango.a.split("-").reverse().join("/")} – {rango.b.split("-").reverse().join("/")}</p>
      ) : null}

      <Link href="/tiktok/pagos" className="block text-sm text-amber-300">Subir reporte de TikTok y marcar lo pagado →</Link>

      {ventas === null && <p className="text-sm text-white/50">Cargando…</p>}
      {ventas !== null && (
        <div className="card !p-0">
          <div className="border-b border-white/10 p-3 text-sm text-white/70">{actual.t}: {lista.length} ventas</div>
          {lista.length === 0 && <p className="p-4 text-center text-sm text-white/50">No hay ventas de este tipo en el periodo.</p>}
          <div className="divide-y divide-white/10">
            {lista.slice(0, max).map((v) => (
              <div key={v.id_venta} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm">{nombre(v)}</div>
                  <div className="truncate text-xs text-white/50">
                    {v.fecha ? v.fecha.split("-").reverse().join("/") : "sin fecha"} · {v.canal || "sin canal"} · {v.estado}
                    {Number(v.cantidad) > 1 ? ` · ${Number(v.cantidad)} pzas` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-amber-400">{fmt.format(Number(v.monto_neto))}</div>
              </div>
            ))}
          </div>
          {lista.length > max && (
            <button className="w-full border-t border-white/10 p-3 text-sm text-amber-300" onClick={() => setMax(max + 25)}>Ver más ({lista.length - max})</button>
          )}
        </div>
      )}
      {per !== "todo" && sinFecha > 0 && (
        <p className="text-xs text-white/40">{sinFecha} ventas sin fecha no entran en un periodo; verlas todas en &quot;Todo&quot; o ponles fecha en Revisar.</p>
      )}
    </section>
  );
}
