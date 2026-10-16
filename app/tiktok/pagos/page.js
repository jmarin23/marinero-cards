"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { notaLimpia } from "@/lib/tablas";
import { leerReporte, conciliar } from "@/lib/conciliar";

const SQL = "alter table ventas add column if not exists id_pago_tiktok text;\nalter table ventas add column if not exists fecha_pago date;";
const f = (d) => (d ? d.split("-").reverse().join("/") : "sin fecha");
const COLS = "id_venta,fecha,cantidad,monto_neto,estado,canal,id_pedido_tiktok,cliente_notas,productos(nombre)";

const VIA = {
  id: "ya traía el ID del pedido",
  liq: "monto igual a lo liquidado",
  neto: "monto igual al precio de venta",
  suma: "suma de varios pedidos",
  aprox: "monto parecido",
};

export default function ConciliarPagos() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const inputRef = useRef(null);
  const [ventas, setVentas] = useState(null);
  const [faltaSQL, setFaltaSQL] = useState(false);
  const [rep, setRep] = useState(null); // { pedidos, pagos, nombre }
  const [sel, setSel] = useState(new Set());
  const [corregir, setCorregir] = useState(false);
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    let r = await sb.from("ventas").select(COLS + ",id_pago_tiktok,fecha_pago").range(0, 4999);
    if (r.error) { // las columnas nuevas aún no existen
      setFaltaSQL(true);
      r = await sb.from("ventas").select(COLS).range(0, 4999);
    } else setFaltaSQL(false);
    setVentas((r.data || []).map((v) => ({ ...v, producto_nombre: v.productos?.nombre || notaLimpia(v.cliente_notas).split("|")[0].trim() || "" })));
  }
  useEffect(() => { cargar(); }, []);

  const res = useMemo(() => (rep && ventas ? conciliar(rep.pedidos, ventas) : null), [rep, ventas]);
  // al cargar un archivo (o recargar ventas) se marcan solas las coincidencias seguras
  useEffect(() => { if (res) setSel(new Set(res.grupos.map((g, i) => (g.tipo === "exacto" ? i : -1)).filter((i) => i >= 0))); }, [res]);

  async function subir(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    try {
      const esCsv = /\.csv$/i.test(file.name);
      const libro = esCsv ? XLSX.read(await file.text(), { type: "string", raw: true }) : XLSX.read(await file.arrayBuffer(), { type: "array" });
      const { pedidos, pagos } = leerReporte(XLSX, libro);
      if (!pedidos.length) throw new Error("El archivo no trae pedidos liquidados.");
      setRep({ pedidos, pagos, nombre: file.name });
    } catch (err) { setRep(null); setMsg({ ok: false, t: err.message }); }
    e.target.value = "";
  }

  const pagoPorId = useMemo(() => Object.fromEntries((rep?.pagos || []).map((p) => [p.id, p])), [rep]);
  const grupos = res?.grupos || [];
  const elegidos = grupos.filter((_, i) => sel.has(i));
  const difMonto = elegidos.reduce((t, g) => t + (g.liq - Number(g.venta.monto_neto)), 0);

  async function aplicar() {
    setGuardando(true); setMsg(null);
    let bien = 0, mal = 0, ultimo = "";
    for (const g of elegidos) {
      const fechas = g.idPago.split(",").map((id) => pagoPorId[id]?.fecha).filter(Boolean).sort();
      const cambios = {
        estado: g.venta.estado === "Cobrado" ? "Cobrado" : "Pagado",
        id_pedido_tiktok: g.pedidos.map((p) => p.id).join(","),
        id_pago_tiktok: g.idPago || null,
        fecha_pago: fechas.pop() || g.fechaCta || null,
      };
      if (corregir) cambios.monto_neto = g.liq;
      if (!g.venta.canal) cambios.canal = "TikTok";
      const { error } = await sb.from("ventas").update(cambios).eq("id_venta", g.venta.id_venta);
      if (error) { mal++; ultimo = error.message; } else bien++;
    }
    setGuardando(false);
    setMsg(mal ? { ok: false, t: `${bien} guardadas, ${mal} con error: ${ultimo}` } : { ok: true, t: `Listo: ${bien} ventas marcadas como Pagado.` });
    cargar();
  }

  // historial: lo ya conciliado, agrupado por fecha de pago
  const historial = useMemo(() => {
    const m = new Map();
    (ventas || []).filter((v) => v.id_pago_tiktok).forEach((v) => {
      const k = v.fecha_pago || "sin fecha";
      const g = m.get(k) || m.set(k, { fecha: k, n: 0, total: 0 }).get(k);
      g.n++; g.total += Number(v.monto_neto);
    });
    return [...m.values()].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [ventas]);

  const toggle = (i) => setSel((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const exactos = grupos.map((g, i) => ({ g, i })).filter((x) => x.g.tipo === "exacto");
  const probables = grupos.map((g, i) => ({ g, i })).filter((x) => x.g.tipo === "probable");

  const Fila = ({ g, i }) => (
    <label className="flex cursor-pointer items-start gap-3 px-3 py-2">
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={sel.has(i)} onChange={() => toggle(i)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{g.venta.producto_nombre || "Venta suelta"}</span>
        <span className="block text-xs text-white/50">
          {g.venta.id_venta} · {f(g.venta.fecha)} · {Number(g.venta.cantidad)} pza{Number(g.venta.cantidad) === 1 ? "" : "s"} · {g.venta.estado}
          {g.pedidos.length > 1 ? ` · ${g.pedidos.length} pedidos de TikTok` : ""}
        </span>
        <span className="block text-xs text-white/40">{VIA[g.via]}{g.idPago && pagoPorId[g.idPago.split(",")[0]] ? ` · pago del ${f(pagoPorId[g.idPago.split(",")[0]].fecha)}` : ""}</span>
      </span>
      <span className="shrink-0 text-right text-sm">
        <span className="block font-semibold text-amber-400">{mxn(Number(g.venta.monto_neto))}</span>
        {Math.abs(g.liq - Number(g.venta.monto_neto)) > 1.5 && <span className="block text-xs text-white/50">TikTok liquidó {mxn(g.liq)}</span>}
      </span>
    </label>
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Conciliar pagos de TikTok</h1>
        <Link href="/datos" className="text-sm text-amber-400">← Datos</Link>
      </div>
      <p className="text-sm text-white/50">
        Sube el reporte de <b className="text-white/70">Ingresos</b> de TikTok Shop (el .xlsx con &quot;Detalles del pedido&quot;). Las ventas que cuadren en monto y fecha se marcan <b className="text-white/70">Pagado</b>. No crea ventas ni toca socios.
      </p>

      {faltaSQL && (
        <div className="card space-y-2 border-amber-500/50 text-sm">
          <div className="text-amber-300">Antes de guardar, corre esto una vez en el SQL Editor de Supabase:</div>
          <pre className="overflow-x-auto rounded-lg bg-black/40 p-2 text-xs text-white/80">{SQL}</pre>
          <button className="underline text-amber-300" onClick={() => navigator.clipboard?.writeText(SQL)}>Copiar</button>
          <button className="ml-4 underline text-white/60" onClick={cargar}>Ya lo corrí</button>
        </div>
      )}

      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={subir} />
      <button className="btn w-full !py-4" onClick={() => inputRef.current?.click()}>{rep ? "Subir otro archivo" : "Subir reporte de ingresos"}</button>
      {msg && <div className={`card text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.t}</div>}
      {ventas === null && <p className="text-sm text-white/50">Cargando ventas…</p>}

      {rep && res && (
        <>
          <section className="card space-y-2">
            <div className="text-sm text-white/70">{rep.nombre} · {rep.pedidos.length} pedidos liquidados · {mxn(rep.pedidos.reduce((t, p) => t + p.liq, 0))}</div>
            {rep.pagos.map((p) => {
              const ps = rep.pedidos.filter((x) => x.idPago === p.id);
              const empatados = ps.filter((x) => grupos.some((g) => g.pedidos.includes(x)) || res.ya.includes(x)).length;
              return (
                <div key={p.id} className="flex items-baseline justify-between gap-2 text-sm">
                  <span>Pago del {f(p.fecha)}</span>
                  <span className="text-right">
                    <b>{mxn(p.monto)}</b>
                    <span className="block text-xs text-white/50">{empatados} de {ps.length} pedidos con venta tuya</span>
                  </span>
                </div>
              );
            })}
          </section>

          <section className="card !p-0">
            <div className="border-b border-white/10 p-3 text-sm">
              <b>Coinciden ({exactos.length})</b> <span className="text-white/50">· palomeadas = se marcan Pagado</span>
            </div>
            {exactos.length === 0 && <p className="p-4 text-center text-sm text-white/50">Nada nuevo que coincida.</p>}
            <div className="divide-y divide-white/10">{exactos.map((x) => <Fila key={x.i} {...x} />)}</div>
          </section>

          {probables.length > 0 && (
            <section className="card !p-0">
              <div className="border-b border-white/10 p-3 text-sm">
                <b>Revísalas ({probables.length})</b> <span className="text-white/50">· parecidas pero no iguales, palomea las que sí sean</span>
              </div>
              <div className="divide-y divide-white/10">{probables.map((x) => <Fila key={x.i} {...x} />)}</div>
            </section>
          )}

          <details className="card !p-0" open={res.sinVenta.length > 0 && res.sinVenta.length <= 15}>
            <summary className="cursor-pointer p-3 text-sm">
              <b>Pedidos de TikTok sin venta tuya ({res.sinVenta.length})</b>
              <span className="text-white/50"> · {mxn(res.sinVenta.reduce((t, p) => t + p.liq, 0))} que TikTok te pagó y no están capturados</span>
            </summary>
            <div className="divide-y divide-white/10 border-t border-white/10">
              {res.sinVenta.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{p.producto}</div>
                    <div className="text-xs text-white/50">{f(p.fecha)} · {p.cantidad} pza{p.cantidad === 1 ? "" : "s"}</div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold text-amber-400">{mxn(p.liq)}</div>
                </div>
              ))}
            </div>
          </details>

          {res.ya.length > 0 && <p className="text-xs text-white/40">{res.ya.length} pedidos de este archivo ya estaban conciliados antes.</p>}
          {res.enEspera.length > 0 && <p className="text-xs text-white/40">{res.enEspera.length} ventas siguen &quot;En espera&quot;: aún no aparecen en este reporte.</p>}

          <div className="fixed inset-x-0 bottom-14 z-30 border-t border-white/10 bg-[#0f1318]/95 p-3 backdrop-blur">
            <div className="mx-auto max-w-3xl space-y-2">
              <label className="flex items-start gap-2 text-xs text-white/60">
                <input type="checkbox" className="mt-0.5" checked={corregir} onChange={(e) => setCorregir(e.target.checked)} />
                <span>Corregir el monto de la venta con lo que TikTok sí liquidó (después de comisiones){elegidos.length > 0 && Math.abs(difMonto) > 1 ? `: cambia ${difMonto < 0 ? "-" : "+"}${mxn(Math.abs(difMonto))} en total` : ""}</span>
              </label>
              <button className="btn w-full !py-3" disabled={!elegidos.length || guardando || faltaSQL} onClick={aplicar}>
                {guardando ? "Guardando…" : `Marcar ${elegidos.length} como Pagado`}
              </button>
            </div>
          </div>
        </>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Historial de pagos conciliados</h2>
        {historial.length === 0 && <p className="text-sm text-white/50">Aún no has conciliado ningún pago.</p>}
        {historial.map((h) => (
          <div key={h.fecha} className="card flex items-baseline justify-between text-sm">
            <span>Pago del {f(h.fecha)}</span>
            <span><b>{h.n}</b> ventas · {mxn(h.total)}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
