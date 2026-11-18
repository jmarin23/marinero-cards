"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { useRefrescar } from "@/lib/useRefrescar";
import { calcularTrazas, deudaCosto } from "@/lib/traza";

const n = (x) => Number(x || 0);
const r2 = (x) => Math.round(x * 100) / 100;
const esSocio = (s) => s && !["Yo", "—", ""].includes(s);
const fechaCorta = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "s/f");

// Cuánto del costo de un lote ya se pagó y si lo ya vendido (y cobrado) alcanza para pagar lo que falta.
export default function PagoLote({ idLote, prodIds, costoLote }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [pagos, setPagos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [monto, setMonto] = useState("");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [prods, setProds] = useState([]);
  const [compra, setCompra] = useState(null);
  const [origen, setOrigen] = useState({});
  const [quien, setQuien] = useState(null); // a quién se le registra el pago
  const clave = prodIds.join(",");

  async function cargar() {
    const filtro = prodIds.length ? `id_lote.eq.${idLote},id_producto.in.(${prodIds.join(",")})` : `id_lote.eq.${idLote}`;
    const [p, v, pr, lc, po] = await Promise.all([
      sb.from("pagos_socios").select("*").or(filtro).range(0, 4999),
      sb.from("ventas").select("id_venta,monto_neto,estado").or(filtro).neq("estado", "Reembolso").range(0, 4999),
      sb.from("v_productos").select("id_producto,id_lote,socio,quien_puso_costo,cantidad,costo_total").eq("id_lote", idLote).range(0, 999),
      sb.from("lotes").select("compra").eq("id_lote", idLote).maybeSingle(), // si aún no existe la columna se ignora
      sb.from("productos").select("id_producto,precio_origen").eq("id_lote", idLote).range(0, 999),
    ]);
    if (p.error || v.error) return setMsg((p.error || v.error).message);
    setProds(pr.error ? [] : pr.data || []);
    setCompra(lc.error ? null : lc.data?.compra || null);
    setOrigen(po.error ? {} : Object.fromEntries((po.data || []).filter((x) => x.precio_origen != null).map((x) => [x.id_producto, Number(x.precio_origen)])));
    const unicos = (a, k) => [...new Map((a || []).map((x) => [x[k], x])).values()];
    setPagos(unicos(p.data, "id_pago").filter((g) => g.tipo === "Costo").sort((a, b) => String(b.id_pago).localeCompare(String(a.id_pago))));
    setVentas(unicos(v.data, "id_venta"));
  }
  useEffect(() => { cargar(); }, [idLote, clave]);
  useRefrescar(cargar);

  // A quién se le paga y cuánto: al socio que puso el costo se le regresa producto + tax (misma regla que Socios); lo que puse yo, completo.
  const { debe, excluido } = useMemo(() => {
    const trazas = calcularTrazas(prods, compra ? { [idLote]: compra } : {}, origen);
    const d = {}; let ex = 0;
    prods.forEach((p) => {
      const deSocio = p.quien_puso_costo === "Socio" && esSocio(p.socio);
      const quienPago = deSocio ? p.socio : "Yo";
      const monto = deSocio ? deudaCosto(p, trazas) : n(p.costo_total);
      d[quienPago] = (d[quienPago] || 0) + monto;
      if (deSocio) ex += n(p.costo_total) - monto;
    });
    if (!Object.keys(d).length) d.Yo = n(costoLote);
    return { debe: d, excluido: ex };
  }, [prods, compra, origen, idLote, costoLote]);
  const quienes = Object.keys(debe).sort((a, b) => (a === "Yo") - (b === "Yo") || a.localeCompare(b));
  const pagadoDe = (q) => pagos.filter((g) => g.socio === q).reduce((t, g) => t + n(g.monto), 0);
  const faltaDe = (q) => Math.max(r2(debe[q] - pagadoDe(q)), 0);
  const quienSel = quien && debe[quien] != null ? quien : quienes.find((q) => faltaDe(q) > 0.5) || quienes[0];
  const costoLote_ = quienes.reduce((t, q) => t + debe[q], 0);
  const pagado = pagos.reduce((t, g) => t + n(g.monto), 0);
  const cobrado = ventas.filter((v) => v.estado === "Pagado").reduce((t, v) => t + n(v.monto_neto), 0);
  const porCobrar = ventas.filter((v) => v.estado !== "Pagado").reduce((t, v) => t + n(v.monto_neto), 0);
  const falta = Math.max(r2(costoLote_ - pagado), 0);
  const pctPagado = costoLote_ > 0 ? Math.min(pagado / costoLote_, 1) : 0;
  const pctCubierto = costoLote_ > 0 ? cobrado / costoLote_ : 0;
  const alcanza = Math.max(Math.min(falta, cobrado - pagado), 0); // lo que ya se puede pagar con lo vendido y cobrado
  const faltaSel = faltaDe(quienSel);
  const alcanzaSel = Math.max(Math.min(faltaSel, alcanza > 0 ? alcanza : 0), 0);

  async function registrar(valor) {
    const m = Number(valor);
    if (!(m > 0)) return setMsg("Escribe un monto mayor a 0");
    setOcupado(true); setMsg("");
    const { data: ult } = await sb.from("pagos_socios").select("id_pago").like("id_pago", "PG%").order("id_pago", { ascending: false }).limit(1);
    const id = "PG" + String((ult?.[0] ? parseInt(String(ult[0].id_pago).replace(/\D/g, ""), 10) || 0 : 0) + 1).padStart(4, "0");
    const { error } = await sb.from("pagos_socios").insert({ id_pago: id, fecha: new Date().toLocaleDateString("en-CA"), socio: quienSel, id_producto: null, id_lote: idLote, tipo: "Costo", monto: r2(m), notas: "Lote completo | " + (quienSel === "Yo" ? "Costo pagado" : "Costo regresado") });
    setOcupado(false);
    if (error) return setMsg(error.message);
    setMonto(""); cargar();
  }
  async function quitar(g) {
    if (!confirm(`¿Quitar el pago del ${fechaCorta(g.fecha)} por ${mxn(g.monto)}?`)) return;
    const { error } = await sb.from("pagos_socios").delete().eq("id_pago", g.id_pago);
    if (error) setMsg(error.message); else cargar();
  }

  if (!(costoLote_ > 0)) return null;
  return (
    <div className="card space-y-3">
      <div className="flex items-baseline justify-between"><span className="text-sm font-semibold">Pago del lote</span><a href={`/socios?q=${encodeURIComponent(idLote)}`} className="text-xs text-amber-300 underline">Ver en Socios →</a></div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/70">Pagado del costo</span>
          <span><b>{mxn(pagado)}</b> <span className="text-white/50">de {mxn(costoLote_)} · {Math.round(pctPagado * 100)}%</span></span>
        </div>
        <div className="mt-1.5 h-2 rounded-sm bg-white/10"><div className="h-full rounded-r-sm bg-emerald-500" style={{ width: `${pctPagado * 100}%` }} /></div>
        <div className="mt-1 text-xs text-white/50">{falta > 0.5 ? `Falta pagar ${mxn(falta)}` : "✔ Costo pagado completo"}</div>
        {(quienes.length > 1 || quienes[0] !== "Yo") && (
          <div className="mt-2 space-y-0.5 text-xs">
            {quienes.map((q) => (
              <div key={q} className="flex justify-between text-white/60">
                <span>{q === "Yo" ? "Lo que puse yo" : `A ${q}`}</span>
                <span>{mxn(pagadoDe(q))} de {mxn(debe[q])}{faltaDe(q) <= 0.5 ? " ✔" : ""}</span>
              </div>
            ))}
          </div>
        )}
        {excluido > 0.5 && <div className="mt-1 text-xs text-white/40">No incluye {mxn(excluido)} de cruce y aduana que pagas tú.</div>}
      </div>

      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-white/70">Vendido y cobrado</span>
          <span><b>{mxn(cobrado)}</b> <span className="text-white/50">· cubre {Math.round(pctCubierto * 100)}% del costo</span></span>
        </div>
        <div className="mt-1.5 h-2 rounded-sm bg-white/10"><div className="h-full rounded-r-sm bg-amber-400" style={{ width: `${Math.min(pctCubierto, 1) * 100}%` }} /></div>
        <div className="mt-1 text-xs text-white/50">
          {pctCubierto >= 1 ? `Ya recuperaste el costo; lo demás (${mxn(cobrado - costoLote_)}) es ganancia` : `Faltan ${mxn(costoLote_ - cobrado)} de ventas para cubrir el costo`}
          {porCobrar > 0.5 ? ` · ${mxn(porCobrar)} más en espera, no cuenta` : ""}
        </div>
      </div>

      <div className={`rounded-lg border p-2 text-sm ${alcanza > 0.5 ? "border-emerald-500/40 text-emerald-300" : "border-white/10 text-white/60"}`}>
        {falta <= 0.5 ? "No queda nada por pagar de este lote."
          : alcanza > 0.5 ? `Con lo ya vendido y cobrado ya puedes pagar hasta ${mxn(alcanza)}.`
          : "Con lo cobrado hasta ahora todavía no alcanza para pagar más."}
      </div>

      {falta > 0.5 && quienes.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-white/50">Pago a:</span>
          {quienes.filter((q) => faltaDe(q) > 0.5).map((q) => (
            <button key={q} onClick={() => setQuien(q)} className={`rounded-md border px-3 py-1 ${quienSel === q ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{q === "Yo" ? "Lo que puse yo" : q}</button>
          ))}
        </div>
      )}
      {falta > 0.5 && faltaSel > 0.5 && (
        <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
          <input className="input !py-2" type="number" inputMode="decimal" step="any" placeholder="Otro monto" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <button disabled={ocupado} onClick={() => registrar(Number(monto) > 0 ? monto : alcanzaSel > 0.5 ? alcanzaSel : faltaSel)}
            className="rounded-lg border border-amber-500/60 px-2 py-3 text-sm leading-tight text-amber-300 active:bg-amber-500/10">
            {Number(monto) > 0 ? `Registrar pago${quienSel !== "Yo" ? ` a ${quienSel}` : ""} de ${mxn(monto)}` : `Registrar pago${quienSel !== "Yo" ? ` a ${quienSel}` : ""}: ${mxn(alcanzaSel > 0.5 ? alcanzaSel : faltaSel)}`}
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
