"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { PREFIJO_PCT } from "@/lib/socios";
import { useRefrescar } from "@/lib/useRefrescar";

const n = (x) => Number(x || 0);
const r2 = (x) => Math.round(x * 100) / 100;
const TOL = 0.5;
const esSocio = (s) => s && !["Yo", "—", ""].includes(s);

// Ganancia que ya puedo pagarme: solo ventas Pagado (las "En espera" no cuentan) y solo en lotes donde
// los socios ya están al corriente con lo liquidado (su parte de ganancia + el costo que pusieron).
export default function Pagarme() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [prods, setProds] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [lotes, setLotes] = useState({});
  const [pctBase, setPctBase] = useState(0.5);
  const [pcts, setPcts] = useState({});
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [montos, setMontos] = useState({});
  const [hora, setHora] = useState(null);

  async function cargar() {
    const [p, v, g, c, l] = await Promise.all([
      sb.from("v_productos").select("id_producto,id_lote,nombre,categoria,socio,quien_puso_costo,cantidad,costo_total,costo_unitario").range(0, 4999),
      sb.from("ventas").select("id_producto,cantidad,monto_neto,estado").not("id_producto", "is", null).neq("estado", "Reembolso").range(0, 4999),
      sb.from("pagos_socios").select("*").range(0, 4999),
      sb.from("config").select("clave,valor"),
      sb.from("lotes").select("id_lote,nombre").range(0, 4999),
    ]);
    const fallo = [p, v, g, c, l].find((x) => x.error);
    if (fallo) setMsg(`No pude leer los datos: ${fallo.error.message}`);
    setProds(p.data || []); setVentas(v.data || []); setPagos(g.data || []);
    setLotes(Object.fromEntries((l.data || []).map((x) => [x.id_lote, x.nombre])));
    const cfg = c.data || [];
    const base = cfg.find((x) => x.clave === "porcentaje_socio");
    if (base) setPctBase(n(base.valor));
    setPcts(Object.fromEntries(cfg.filter((x) => x.clave.startsWith(PREFIJO_PCT)).map((x) => [x.clave.slice(PREFIJO_PCT.length), n(x.valor)])));
    setHora(new Date());
  }
  useEffect(() => { cargar(); }, []);
  useRefrescar(cargar);

  const pctDe = (s) => (pcts[s] !== undefined ? pcts[s] : pctBase);

  const { filas, listoTotal, esperando, yaMePague } = useMemo(() => {
    const pagadas = {};
    ventas.filter((v) => v.estado === "Pagado").forEach((v) => {
      const a = (pagadas[v.id_producto] ||= { q: 0, r: 0 });
      a.q += n(v.cantidad); a.r += n(v.monto_neto);
    });
    const prodPorId = Object.fromEntries(prods.map((p) => [p.id_producto, p]));
    const L = new Map();
    for (const p of prods) {
      const k = p.id_lote || `P|${p.id_producto}`;
      if (!L.has(k)) L.set(k, { k, idLote: p.id_lote || null, idProd: p.id_producto, nombre: p.id_lote ? (lotes[p.id_lote] || p.id_lote) : p.nombre, socios: new Map(), mi: 0, pagYo: 0 });
      const l = L.get(k);
      const extra = p.categoria === "Costo extra";
      const a = pagadas[p.id_producto] || { q: 0, r: 0 };
      const cu = n(p.costo_unitario);
      const gLiq = extra ? -n(p.costo_total) : a.r - a.q * cu;
      if (esSocio(p.socio)) {
        const pct = pctDe(p.socio);
        if (!l.socios.has(p.socio)) l.socios.set(p.socio, { socio: p.socio, pct, debe: 0, pagado: 0 });
        const so = l.socios.get(p.socio);
        so.debe += gLiq * pct + (p.quien_puso_costo === "Socio" ? (extra ? n(p.costo_total) : a.q * cu) : 0);
        l.mi += gLiq * (1 - pct);
      } else l.mi += gLiq;
    }
    for (const g of pagos) {
      const pr = g.id_producto && prodPorId[g.id_producto];
      const k = g.id_lote && !g.id_producto ? g.id_lote : pr ? (pr.id_lote || `P|${pr.id_producto}`) : null;
      const l = k && L.get(k);
      if (!l) continue;
      if (g.socio === "Yo") { if (g.tipo !== "Costo") l.pagYo += n(g.monto); }
      else if (l.socios.has(g.socio)) l.socios.get(g.socio).pagado += n(g.monto);
    }
    const filas = [...L.values()].map((l) => {
      const disponible = r2(l.mi - l.pagYo);
      const faltan = [...l.socios.values()].map((s) => ({ ...s, falta: r2(s.debe - s.pagado) })).filter((s) => s.falta > TOL);
      return { ...l, disponible, faltan, listo: faltan.length === 0 };
    });
    return {
      filas,
      listoTotal: filas.filter((f) => f.listo && f.disponible > TOL).reduce((t, f) => t + f.disponible, 0),
      esperando: filas.filter((f) => !f.listo && f.disponible > TOL).reduce((t, f) => t + f.disponible, 0),
      yaMePague: filas.reduce((t, f) => t + f.pagYo, 0),
    };
  }, [prods, ventas, pagos, lotes, pctBase, pcts]);

  const listos = filas.filter((f) => f.listo && f.disponible > TOL).sort((a, b) => b.disponible - a.disponible);
  const enEspera = filas.filter((f) => !f.listo && f.disponible > TOL).sort((a, b) => b.disponible - a.disponible);

  async function meePague(f, monto) {
    if (!(monto > 0)) return setMsg("Escribe un monto mayor a 0");
    if (monto > f.disponible + TOL && !confirm(`Es más de lo disponible (${mxn(f.disponible)}). ¿Registrar ${mxn(monto)} de todos modos?`)) return;
    setOcupado(f.k); setMsg(null);
    const max = pagos.reduce((m, x) => Math.max(m, parseInt(String(x.id_pago).replace(/\D/g, ""), 10) || 0), 0);
    const { error } = await sb.from("pagos_socios").insert({
      id_pago: "PG" + String(max + 1).padStart(4, "0"),
      fecha: new Date().toISOString().slice(0, 10),
      socio: "Yo", id_producto: f.idLote ? null : f.idProd, id_lote: f.idLote, tipo: "Ganancia", monto: r2(monto),
      notas: (f.idLote ? "Lote completo | " : "") + "Me pagué ganancia",
    });
    setOcupado(null);
    if (error) setMsg(error.message); else { setMontos((m) => ({ ...m, [f.k]: "" })); cargar(); }
  }

  const con = (f) => (f.socios.size ? `Con ${[...f.socios.values()].map((s) => `${s.socio} ${Math.round(s.pct * 100)}%`).join(", ")} · ya liquidados` : "Solo mío");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Ya me puedo pagar</h1>
        <Link href="/socios" className="text-sm text-amber-400">Socios →</Link>
      </div>
      <div className="-mt-3 flex items-center justify-between text-xs text-white/40">
        <span>{hora ? `Actualizado ${hora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}` : "Cargando…"}</span>
        <button className="text-amber-300 underline" onClick={cargar}>Actualizar</button>
      </div>
      {msg && <p className="text-sm text-red-300">{msg}</p>}

      <div className="card">
        <div className="text-xs uppercase text-white/50">Separa y págate</div>
        <div className="mt-1 text-3xl font-bold text-emerald-400">{mxn(listoTotal)}</div>
        <div className="mt-2 flex justify-between text-xs text-white/50">
          <span>Ya me pagué {mxn(yaMePague)}</span>
          <span>Aún no (faltan socios) {mxn(esperando)}</span>
        </div>
      </div>

      <section className="space-y-2">
        {listos.map((f) => {
          const monto = Number(montos[f.k]) || 0;
          return (
            <div key={f.k} className="card space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{f.nombre}</div>
                  <div className="text-xs text-white/50">{con(f)}{f.pagYo > TOL ? ` · ya me pagué ${mxn(f.pagYo)}` : ""}</div>
                </div>
                <b className="shrink-0 text-emerald-400">{mxn(f.disponible)}</b>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2">
                <input className="input !py-2" type="number" inputMode="decimal" step="any" placeholder="Otro monto" value={montos[f.k] ?? ""}
                  onChange={(e) => setMontos((m) => ({ ...m, [f.k]: e.target.value }))} />
                <button disabled={ocupado === f.k} onClick={() => meePague(f, monto > 0 ? monto : f.disponible)}
                  className="rounded-lg border border-amber-500/60 px-2 py-3 text-sm leading-tight text-amber-300 active:bg-amber-500/10">
                  {monto > 0 ? `Me pagué ${mxn(monto)}` : `Me pagué: ${mxn(f.disponible)}`}
                </button>
              </div>
            </div>
          );
        })}
        {listos.length === 0 && <p className="text-sm text-white/50">Por ahora no hay ganancia liquidada pendiente de pagarte.</p>}
      </section>

      {enEspera.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer text-sm text-amber-300">Aún no: primero hay que pagar a socios ({enEspera.length})</summary>
          <div className="mt-3 space-y-3 text-sm">
            {enEspera.map((f) => (
              <div key={f.k}>
                <div className="flex justify-between gap-3"><span className="min-w-0 truncate text-white/80">{f.nombre}</span><span className="shrink-0 text-white/60">{mxn(f.disponible)}</span></div>
                <div className="text-xs text-white/50">Falta pagar a {f.faltan.map((s) => `${s.socio} ${mxn(s.falta)}`).join(", ")}</div>
              </div>
            ))}
          </div>
        </details>
      )}

      <p className="text-xs text-white/40">
        Solo cuentan las ventas en estado Pagado, con el costo de lo vendido ya descontado. Un lote con socios aparece hasta que ya les pagaste su parte de lo liquidado.
      </p>
    </div>
  );
}
