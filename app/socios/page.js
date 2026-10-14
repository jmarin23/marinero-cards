"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

const n = (x) => Number(x || 0);

export default function Socios() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [resumen, setResumen] = useState([]);
  const [prods, setProds] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [pct, setPct] = useState(0.5);
  const [filtro, setFiltro] = useState("Todos");
  const [pagados, setPagados] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  async function cargar() {
    const [r, p, g, c] = await Promise.all([
      sb.from("v_socios").select("*").order("debo_al_socio", { ascending: false }),
      sb.from("v_productos").select("id_producto,id_lote,nombre,socio,quien_puso_costo,costo_total,costo_inventario,ganancia_real")
        .not("socio", "in", '("Yo","—","")').order("id_producto").range(0, 4999),
      sb.from("pagos_socios").select("*").range(0, 4999),
      sb.from("config").select("valor").eq("clave", "porcentaje_socio").single(),
    ]);
    setResumen(r.data || []); setProds(p.data || []); setPagos(g.data || []);
    if (c.data) setPct(n(c.data.valor));
  }
  useEffect(() => { cargar(); }, []);

  const lotesPagados = useMemo(() => new Set(pagos.filter((x) => x.id_lote).map((x) => `${x.socio}|${x.id_lote}`)), [pagos]);
  const pagoDe = (id, tipo) => pagos.find((x) => x.id_producto === id && x.tipo === tipo);

  const filas = useMemo(() => {
    const out = [];
    for (const p of prods) {
      if (lotesPagados.has(`${p.socio}|${p.id_lote}`)) continue;
      if (filtro !== "Todos" && p.socio !== filtro) continue;
      const costoMonto = p.quien_puso_costo === "Socio" ? n(p.costo_total) - n(p.costo_inventario) : 0;
      const gananciaMonto = Math.max(0, n(p.ganancia_real)) * pct;
      const pc = pagoDe(p.id_producto, "Costo");
      const pg = pagoDe(p.id_producto, "Ganancia");
      const pendCosto = costoMonto > 0 && !pc;
      const pendGan = gananciaMonto > 0 && !pg;
      if (!pagados && !pendCosto && !pendGan) continue;
      if (costoMonto <= 0 && gananciaMonto <= 0) continue;
      out.push({ p, costoMonto, gananciaMonto, pc, pg });
    }
    return out;
  }, [prods, pagos, pct, filtro, pagados, lotesPagados]);

  async function alternar(p, tipo, monto, existente) {
    setOcupado(p.id_producto + tipo); setMsg(null);
    let error;
    if (existente) ({ error } = await sb.from("pagos_socios").delete().eq("id_pago", existente.id_pago));
    else {
      const max = pagos.reduce((m, x) => Math.max(m, parseInt(String(x.id_pago).replace(/\D/g, ""), 10) || 0), 0);
      ({ error } = await sb.from("pagos_socios").insert({
        id_pago: "PG" + String(max + 1).padStart(4, "0"),
        fecha: new Date().toISOString().slice(0, 10),
        socio: p.socio, id_producto: p.id_producto, tipo,
        monto: Math.round(monto * 100) / 100,
        notas: tipo === "Costo" ? "Costo regresado" : "Ganancia pagada",
      }));
    }
    setOcupado(null);
    if (error) setMsg(error.message); else cargar();
  }

  async function guardarPct(v) {
    setPct(v);
    await sb.from("config").update({ valor: v }).eq("clave", "porcentaje_socio");
    cargar();
  }

  const nombres = ["Todos", ...resumen.map((s) => s.socio)];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Socios</h1>
        <Link href="/datos/pagos_socios" className="text-sm text-amber-400">Editar pagos →</Link>
      </div>

      <label className="card flex items-center justify-between text-sm">
        % de la ganancia para el socio
        <span className="flex items-center gap-1">
          <input className="input !w-20 text-right" type="number" min="0" max="100" value={Math.round(pct * 100)}
            onChange={(e) => setPct(Number(e.target.value) / 100)} onBlur={(e) => guardarPct(Number(e.target.value) / 100)} />%
        </span>
      </label>

      <section className="space-y-2">
        {resumen.map((s) => (
          <div key={s.socio} className="card">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{s.socio}</span>
              <span className={n(s.debo_al_socio) > 0.5 ? "font-bold text-amber-400" : "text-emerald-400"}>
                {n(s.debo_al_socio) > 0.5 ? `Debo ${mxn(s.debo_al_socio)}` : "Al corriente"}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-white/50">
              <span>Parte<br /><b className="text-white/80">{mxn(s.parte_socio)}</b></span>
              <span>Costo por regresar<br /><b className="text-white/80">{mxn(s.costo_por_regresar)}</b></span>
              <span>Pagado<br /><b className="text-white/80">{mxn(s.pagos_registrados)}</b></span>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {nombres.map((nm) => (
            <button key={nm} onClick={() => setFiltro(nm)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${filtro === nm ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{nm}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={pagados} onChange={(e) => setPagados(e.target.checked)} /> Mostrar también los ya pagados
        </label>
        {msg && <p className="text-sm text-red-300">{msg}</p>}

        {filas.map(({ p, costoMonto, gananciaMonto, pc, pg }) => (
          <div key={p.id_producto} className="card space-y-2">
            <div>
              <div className="truncate">{p.nombre}</div>
              <div className="text-xs text-white/50">{p.id_producto} · {p.socio}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {costoMonto > 0 && (
                <button disabled={ocupado === p.id_producto + "Costo"} onClick={() => alternar(p, "Costo", costoMonto, pc)}
                  className={`rounded-lg border px-3 py-2 text-sm ${pc ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-white/20"}`}>
                  {pc ? "✔" : "☐"} Costo {mxn(costoMonto)}
                </button>
              )}
              {gananciaMonto > 0 && (
                <button disabled={ocupado === p.id_producto + "Ganancia"} onClick={() => alternar(p, "Ganancia", gananciaMonto, pg)}
                  className={`rounded-lg border px-3 py-2 text-sm ${pg ? "border-emerald-500 bg-emerald-500/15 text-emerald-300" : "border-white/20"}`}>
                  {pg ? "✔" : "☐"} Ganancia {mxn(gananciaMonto)}
                </button>
              )}
            </div>
          </div>
        ))}
        {filas.length === 0 && <p className="text-sm text-white/50">Nada pendiente con este filtro.</p>}
        <p className="text-xs text-white/40">Los lotes completos que ya pagaste (Lote 1-3 de Monas) aparecen en "Editar pagos".</p>
      </section>
    </div>
  );
}
