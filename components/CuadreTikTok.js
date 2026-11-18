"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRefrescar } from "@/lib/useRefrescar";
import Panel from "@/components/Panel";
import { T } from "@/components/Resumen";

const fmt = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const n = (x) => Number(x || 0);
const r2 = (x) => Math.round(x * 100) / 100;
const hoyNum = () => Number(new Date().toLocaleDateString("en-CA").replaceAll("-", ""));
const fechaDe = (num) => (num ? `${String(num).slice(6, 8)}/${String(num).slice(4, 6)}` : "");
const suma = (l) => r2(l.reduce((t, v) => t + n(v.monto_neto), 0));

// Compara lo que dice TikTok Shop (Pagado / Por pagar) contra tus ventas de TikTok, separando lo conciliado con reporte de lo marcado a mano.
export default function CuadreTikTok() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [ventas, setVentas] = useState(null);
  const [ref, setRef] = useState({ pagado: "", pendiente: "", fecha: 0 });
  const [msg, setMsg] = useState("");

  async function cargar() {
    let v = await sb.from("ventas").select("id_venta,fecha,monto_neto,estado,canal,id_pago_tiktok,cliente_notas,productos(nombre)").eq("canal", "TikTok").range(0, 4999);
    if (v.error) v = await sb.from("ventas").select("id_venta,fecha,monto_neto,estado,canal,cliente_notas,productos(nombre)").eq("canal", "TikTok").range(0, 4999); // sin la columna de pagos
    setVentas(v.data || []);
    const c = await sb.from("config").select("clave,valor").in("clave", ["tiktok_ref_pagado", "tiktok_ref_pendiente", "tiktok_ref_fecha"]);
    const g = Object.fromEntries((c.data || []).map((x) => [x.clave, n(x.valor)]));
    if (g.tiktok_ref_pagado != null) setRef({ pagado: String(g.tiktok_ref_pagado), pendiente: String(g.tiktok_ref_pendiente ?? ""), fecha: g.tiktok_ref_fecha || 0 });
  }
  useEffect(() => { cargar(); }, [sb]);
  useRefrescar(cargar);

  async function guardar() {
    setMsg("");
    const f = hoyNum();
    const filas = [
      { clave: "tiktok_ref_pagado", valor: n(ref.pagado) },
      { clave: "tiktok_ref_pendiente", valor: n(ref.pendiente) },
      { clave: "tiktok_ref_fecha", valor: f },
    ];
    const { error } = await sb.from("config").upsert(filas, { onConflict: "clave" });
    if (error) return setMsg(error.message);
    setRef((r) => ({ ...r, fecha: f })); setMsg("Guardado");
  }

  if (ventas === null) return null;
  const validas = ventas.filter((v) => v.estado !== "Reembolso");
  const pagadas = validas.filter((v) => v.estado === "Pagado" || v.estado === "Cobrado");
  const conReporte = pagadas.filter((v) => v.id_pago_tiktok);
  const aMano = pagadas.filter((v) => !v.id_pago_tiktok);
  const espera = validas.filter((v) => v.estado === "En espera");
  const sinEmpatar = validas.filter((v) => v.estado === "Sin empatar" || v.estado === "Revisar");

  const tkPag = n(ref.pagado), tkPen = n(ref.pendiente);
  const hay = ref.pagado !== "" || ref.pendiente !== "";
  const apPag = suma(pagadas), apPen = suma(espera);
  const dif = (app, tk) => r2(app - tk);
  const Dif = ({ d }) => Math.abs(d) < 1
    ? <span style={{ color: T.bueno }}>✔ cuadra</span>
    : <span style={{ color: T.naranja }}>{d > 0 ? "+" : "−"}{fmt.format(Math.abs(d))} {d > 0 ? "de más en la app" : "falta en la app"}</span>;
  const nombre = (v) => v.productos?.nombre || String(v.cliente_notas || "").split("|")[0].trim() || "Venta suelta";
  const dPag = dif(apPag, tkPag), dPen = dif(apPen, tkPen);

  const Fila = ({ t, sub, app, tk, d }) => (
    <div className="grid grid-cols-[minmax(0,1.4fr)_1fr_1fr] items-start gap-x-3 gap-y-0.5 border-b border-white/10 py-2.5 text-sm last:border-0">
      <div className="min-w-0"><div>{t}</div>{sub && <div className="text-[0.6875rem]" style={{ color: T.apagado }}>{sub}</div>}</div>
      <div className="text-right"><div className="font-semibold">{fmt.format(app)}</div><div className="text-[0.6875rem]" style={{ color: T.apagado }}>tu app</div></div>
      <div className="text-right">{tk != null ? <><div className="font-semibold">{fmt.format(tk)}</div><div className="text-[0.6875rem]" style={{ color: T.apagado }}>TikTok</div></> : <span style={{ color: T.apagado }}>—</span>}</div>
      {d != null && <div className="col-span-3 text-right text-xs"><Dif d={d} /></div>}
    </div>
  );

  return (
    <Panel titulo="Cuadre con TikTok" sub={ref.fecha ? `Cifras de TikTok capturadas el ${fechaDe(ref.fecha)}` : "Captura lo que dice TikTok Shop para comparar"}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-xs" style={{ color: T.apagado }}>TikTok · Pagado
          <input className="input mt-1 !py-2" type="number" step="any" inputMode="decimal" value={ref.pagado} onChange={(e) => setRef({ ...ref, pagado: e.target.value })} placeholder="ej. 215717.23" />
        </label>
        <label className="text-xs" style={{ color: T.apagado }}>TikTok · Por pagar (procesando + en espera)
          <input className="input mt-1 !py-2" type="number" step="any" inputMode="decimal" value={ref.pendiente} onChange={(e) => setRef({ ...ref, pendiente: e.target.value })} placeholder="ej. 52466" />
        </label>
        <button className="btn !py-2 self-end" onClick={guardar}>Guardar</button>
      </div>
      {msg && <p className="mt-1 text-xs" style={{ color: T.apagado }}>{msg}</p>}

      <div className="mt-3">
        <Fila t="Pagado" sub={`${pagadas.length} ventas · ${conReporte.length} con reporte, ${aMano.length} marcadas a mano`} app={apPag} tk={hay ? tkPag : null} d={hay ? dPag : null} />
        <Fila t="Por pagar (En espera)" sub={`${espera.length} ventas`} app={apPen} tk={hay ? tkPen : null} d={hay ? dPen : null} />
        <Fila t="Total pagado + por pagar" app={r2(apPag + apPen)} tk={hay ? r2(tkPag + tkPen) : null} d={hay ? dif(apPag + apPen, tkPag + tkPen) : null} />
        <Fila t="Sin empatar" sub={`${sinEmpatar.length} ventas que aún no aparecen en ningún reporte; no cuentan arriba`} app={suma(sinEmpatar)} tk={null} d={null} />
      </div>

      {hay && (
        <div className="mt-2 space-y-1 text-xs" style={{ color: T.tinta2 }}>
          {dPag < -1 && <p>TikTok ya pagó más de lo que tienes como Pagado: probablemente hay ventas que aquí siguen En espera. Sube el reporte de ingresos más reciente en <Link href="/tiktok/pagos" className="text-amber-300 underline">Subir reporte de TikTok</Link>.</p>}
          {dPag > 1 && <p>Tienes más como Pagado que lo que TikTok ha depositado. Revisa abajo las ventas marcadas a mano sin reporte: pueden estar repetidas o aún no depositadas.</p>}
          {Math.abs(dPag) < 1 && Math.abs(dPen) >= 1 && <p>Lo Pagado cuadra; la diferencia está en lo que falta por pagar. Compara con tus ventas En espera y Sin empatar.</p>}
        </div>
      )}

      {aMano.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-amber-300/90">Pagadas a mano, sin reporte de TikTok ({aMano.length} · {fmt.format(suma(aMano))})</summary>
          <div className="mt-2 divide-y divide-white/10">
            {[...aMano].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""))).slice(0, 40).map((v) => (
              <div key={v.id_venta} className="flex justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">{nombre(v)} <span style={{ color: T.apagado }}>· {v.id_venta} · {v.fecha ? v.fecha.split("-").reverse().slice(0, 2).join("/") : "sin fecha"}</span></span>
                <span className="shrink-0">{fmt.format(n(v.monto_neto))}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </Panel>
  );
}
