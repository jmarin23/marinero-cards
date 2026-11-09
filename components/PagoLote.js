"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { useRefrescar } from "@/lib/useRefrescar";

const n = (x) => Number(x || 0);
const r2 = (x) => Math.round(x * 100) / 100;
const fechaCorta = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "s/f");

// Cuánto del costo de un lote ya se pagó y si lo ya vendido (y cobrado) alcanza para pagar lo que falta.
export default function PagoLote({ idLote, prodIds, costoLote }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [pagos, setPagos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [monto, setMonto] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const clave = prodIds.join(",");

  async function cargar() {
    const filtro = prodIds.length ? `id_lote.eq.${idLote},id_producto.in.(${prodIds.join(",")})` : `id_lote.eq.${idLote}`;
    const [p, v] = await Promise.all([
      sb.from("pagos_socios").select("*").or(filtro).range(0, 4999),
      sb.from("ventas").select("id_venta,monto_neto,estado").or(filtro).neq("estado", "Reembolso").range(0, 4999),
    ]);
    if (p.error || v.error) return setMsg((p.error || v.error).message);
    const unicos = (a, k) => [...new Map((a || []).map((x) => [x[k], x])).values()];
    setPagos(unicos(p.data, "id_pago").filter((g) => g.tipo === "Costo").sort((a, b) => String(b.id_pago).localeCompare(String(a.id_pago))));
    setVentas(unicos(v.data, "id_venta"));
  }
  useEffect(() => { cargar(); }, [idLote, clave]);
  useRefrescar(cargar);

  const pagado = pagos.reduce((t, g) => t + n(g.monto), 0);
  const cobrado = ventas.filter((v) => v.estado === "Pagado").reduce((t, v) => t + n(v.monto_neto), 0);
  const porCobrar = ventas.filter((v) => v.estado !== "Pagado").reduce((t, v) => t + n(v.monto_neto), 0);
  const falta = Math.max(r2(costoLote - pagado), 0);
  const pctPagado = costoLote > 0 ? Math.min(pagado / costoLote, 1) : 0;
  const pctCubierto = costoLote > 0 ? cobrado / costoLote : 0;
  const alcanza = Math.max(Math.min(falta, cobrado - pagado), 0); // lo que ya se puede pagar con lo vendido y cobrado

  async function registrar(valor) {
    const m = Number(valor);
    if (!(m > 0)) return setMsg("Escribe un monto mayor a 0");
    setOcupado(true); setMsg("");
    const { data: ult } = await sb.from("pagos_socios").select("id_pago").like("id_pago", "PG%").order("id_pago", { ascending: false }).limit(1);
    const id = "PG" + String((ult?.[0] ? parseInt(String(ult[0].id_pago).replace(/\D/g, ""), 10) || 0 : 0) + 1).padStart(4, "0");
    const { error } = await sb.from("pagos_socios").insert({ id_pago: id, fecha: new Date().toLocaleDateString("en-CA"), socio: "Yo", id_producto: null, id_lote: idLote, tipo: "Costo", monto: r2(m), notas: "Lote completo | Costo pagado" });
    setOcupado(false);
    if (error) return setMsg(error.message);
    setMonto(""); cargar();
  }
  async function quitar(g) {
    if (!confirm(`¿Quitar el pago del ${fechaCorta(g.fecha)} por ${mxn(g.monto)}?`)) return;
    const { error } = await sb.from("pagos_socios").delete().eq("id_pago", g.id_pago);
    if (error) setMsg(error.message); else cargar();
  }

  if (!(costoLote > 0)) return null;
  return (
    <div className="card space-y-3">
      <div className="text-sm font-semibold">Pago del lote</div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/70">Pagado del costo</span>
          <span><b>{mxn(pagado)}</b> <span className="text-white/50">de {mxn(costoLote)} · {Math.round(pctPagado * 100)}%</span></span>
        </div>
        <div className="mt-1.5 h-2 rounded-sm bg-white/10"><div className="h-full rounded-r-sm bg-emerald-500" style={{ width: `${pctPagado * 100}%` }} /></div>
        <div className="mt-1 text-xs text-white/50">{falta > 0.5 ? `Falta pagar ${mxn(falta)}` : "✔ Costo pagado completo"}</div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/70">Vendido y cobrado</span>
          <span><b>{mxn(cobrado)}</b> <span className="text-white/50">· cubre {Math.round(pctCubierto * 100)}% del costo</span></span>
        </div>
        <div className="mt-1.5 h-2 rounded-sm bg-white/10"><div className="h-full rounded-r-sm bg-amber-400" style={{ width: `${Math.min(pctCubierto, 1) * 100}%` }} /></div>
        <div className="mt-1 text-xs text-white/50">
          {pctCubierto >= 1 ? `Ya recuperaste el costo; lo demás (${mxn(cobrado - costoLote)}) es ganancia` : `Faltan ${mxn(costoLote - cobrado)} de ventas para cubrir el costo`}
          {porCobrar > 0.5 ? ` · ${mxn(porCobrar)} más en espera, no cuenta` : ""}
        </div>
      </div>

      <div className={`rounded-lg border p-2 text-sm ${alcanza > 0.5 ? "border-emerald-500/40 text-emerald-300" : "border-white/10 text-white/60"}`}>
        {falta <= 0.5 ? "No queda nada por pagar de este lote."
          : alcanza > 0.5 ? `Con lo ya vendido y cobrado ya puedes pagar hasta ${mxn(alcanza)}.`
          : "Con lo cobrado hasta ahora todavía no alcanza para pagar más."}
      </div>

      {falta > 0.5 && (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
          <input className="input !py-2" type="number" inputMode="decimal" step="any" placeholder="Otro monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <button disabled={ocupado} onClick={() => registrar(Number(monto) > 0 ? monto : alcanza > 0.5 ? alcanza : falta)}
            className="rounded-lg border border-amber-500/60 px-2 py-3 text-sm leading-tight text-amber-300 active:bg-amber-500/10">
            {Number(monto) > 0 ? `Registrar pago de ${mxn(monto)}` : `Registrar pago: ${mxn(alcanza > 0.5 ? alcanza : falta)}`}
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-red-300">{msg}</p>}

      {pagos.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-amber-300/80">Ver pagos registrados ({pagos.length})</summary>
          <div className="mt-2 space-y-1">
            {pagos.map((g) => (
              <div key={g.id_pago} className="flex items-center justify-between gap-3 text-white/60">
                <span className="min-w-0 truncate">{fechaCorta(g.fecha)} · {g.socio}{g.id_producto ? " · un producto" : ""}</span>
                <span className="shrink-0">{mxn(g.monto)} <button className="ml-2 text-red-400 underline" onClick={() => quitar(g)}>Quitar</button></span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
