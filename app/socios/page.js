"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

const n = (x) => Number(x || 0);
const r2 = (x) => Math.round(x * 100) / 100;
const TOL = 0.5; // diferencias menores a 50 centavos cuentan como "al corriente"

export default function Socios() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [prods, setProds] = useState([]);
  const [lotes, setLotes] = useState({});
  const [pagos, setPagos] = useState([]);
  const [pct, setPct] = useState(0.5);
  const [filtro, setFiltro] = useState("Todos");
  const [alCorriente, setAlCorriente] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ocupado, setOcupado] = useState(null);

  async function cargar() {
    const [p, g, c, l] = await Promise.all([
      sb.from("v_productos").select("id_producto,id_lote,nombre,socio,quien_puso_costo,cantidad,vendidas,costo_total,costo_inventario,ganancia_real").range(0, 4999),
      sb.from("pagos_socios").select("*").range(0, 4999),
      sb.from("config").select("valor").eq("clave", "porcentaje_socio").single(),
      sb.from("lotes").select("id_lote,nombre").range(0, 4999),
    ]);
    setProds(p.data || []); setPagos(g.data || []);
    setLotes(Object.fromEntries((l.data || []).map((x) => [x.id_lote, x.nombre])));
    if (c.data) setPct(n(c.data.valor));
  }
  useEffect(() => { cargar(); }, []);

  const esSocio = (s) => s && !["Yo", "—", ""].includes(s);

  // ---- unidades de cobro: un lote completo (si le pagaste por lote) o un producto ----
  const { unidades, resumen, avisos } = useMemo(() => {
    const prodSocios = prods.filter((p) => esSocio(p.socio));
    const lotePagado = new Set(pagos.filter((x) => x.id_lote && !x.id_producto).map((x) => `${x.socio}|${x.id_lote}`));
    const claveDe = (socio, idLote, idProd) => (lotePagado.has(`${socio}|${idLote}`) ? `L|${socio}|${idLote}` : `P|${idProd}`);

    const U = new Map();
    for (const p of prodSocios) {
      const k = claveDe(p.socio, p.id_lote, p.id_producto);
      if (!U.has(k)) U.set(k, {
        k, socio: p.socio, lote: k.startsWith("L|") ? p.id_lote : null, idProducto: k.startsWith("P|") ? p.id_producto : null,
        nombre: k.startsWith("L|") ? `${lotes[p.id_lote] || p.id_lote} (lote completo)` : p.nombre,
        productos: [], debeCosto: 0, parte: 0, pagCosto: 0, pagGan: 0, pagos: [],
      });
      const u = U.get(k);
      u.productos.push(p);
      u.debeCosto += p.quien_puso_costo === "Socio" ? n(p.costo_total) - n(p.costo_inventario) : 0;
      u.parte += n(p.ganancia_real) * pct;
    }
    const prodPorId = Object.fromEntries(prods.map((p) => [p.id_producto, p]));
    const huerfanos = [];
    for (const g of pagos) {
      let k = null;
      if (g.id_lote && !g.id_producto) k = `L|${g.socio}|${g.id_lote}`;
      else if (g.id_producto) { const p = prodPorId[g.id_producto]; k = p ? claveDe(g.socio, p.id_lote, g.id_producto) : null; }
      const u = k && U.get(k);
      if (!u) { huerfanos.push(g); continue; }
      if (g.tipo === "Costo") u.pagCosto += n(g.monto); else u.pagGan += n(g.monto);
      u.pagos.push(g);
    }

    // resumen por socio: misma fórmula que la vista v_socios
    const S = new Map();
    const alta = (s) => { if (!S.has(s)) S.set(s, { socio: s, ganancia: 0, parte: 0, cpr: 0, pagado: 0 }); return S.get(s); };
    for (const p of prodSocios) {
      const s = alta(p.socio);
      s.ganancia += n(p.ganancia_real);
      s.parte += n(p.ganancia_real) * pct;
      if (p.quien_puso_costo === "Socio") s.cpr += n(p.costo_total) - n(p.costo_inventario);
    }
    for (const g of pagos) alta(g.socio).pagado += n(g.monto);
    const resumen = [...S.values()].map((s) => ({ ...s, debo: s.cpr + s.parte - s.pagado })).sort((a, b) => b.debo - a.debo);

    // avisos de datos que no cuadran
    const avisos = [];
    const sinQuien = prodSocios.filter((p) => !p.quien_puso_costo && n(p.costo_total) > 0);
    if (sinQuien.length) avisos.push({ t: `${sinQuien.length} productos con socio no dicen quién pagó el costo (se cuentan como que lo pagaste tú).`, a: "/datos/productos" });
    const pagoSocioDistinto = pagos.filter((g) => {
      const p = g.id_producto && prodPorId[g.id_producto];
      return p && p.socio !== g.socio;
    });
    if (pagoSocioDistinto.length) avisos.push({ t: `${pagoSocioDistinto.length} pagos están a nombre de un socio distinto al del producto (${pagoSocioDistinto.slice(0, 3).map((g) => g.id_pago).join(", ")}).`, a: "/datos/pagos_socios" });
    if (huerfanos.length) avisos.push({ t: `${huerfanos.length} pagos no se pueden ligar a ningún producto o lote con ese socio (${huerfanos.slice(0, 3).map((g) => g.id_pago).join(", ")}).`, a: "/datos/pagos_socios" });
    for (const u of U.values()) {
      const sinVentas = u.productos.every((p) => n(p.vendidas) === 0);
      if (sinVentas && (u.pagCosto + u.pagGan) > TOL) avisos.push({ t: `${u.nombre}: ya registraste ${mxn(u.pagCosto + u.pagGan)} de pago pero aún no hay ventas capturadas. Se acomoda solo al meter las ventas.`, a: null });
    }
    return { unidades: [...U.values()], resumen, avisos };
  }, [prods, pagos, pct, lotes]);

  const nombres = ["Todos", ...resumen.map((s) => s.socio)];

  const lineas = (u) => {
    const falCosto = r2(u.debeCosto - u.pagCosto);
    const falGan = r2(u.parte - u.pagGan);
    return { falCosto, falGan, tieneCosto: Math.abs(u.debeCosto) > TOL || u.pagCosto > TOL, tieneGan: Math.abs(u.parte) > TOL || u.pagGan > TOL };
  };
  const filas = unidades.filter((u) => {
    if (filtro !== "Todos" && u.socio !== filtro) return false;
    const l = lineas(u);
    if (!l.tieneCosto && !l.tieneGan) return false;
    const pendiente = (l.tieneCosto && Math.abs(l.falCosto) > TOL) || (l.tieneGan && Math.abs(l.falGan) > TOL);
    return alCorriente || pendiente;
  });

  async function pagar(u, tipo, monto) {
    setOcupado(u.k + tipo); setMsg(null);
    const max = pagos.reduce((m, x) => Math.max(m, parseInt(String(x.id_pago).replace(/\D/g, ""), 10) || 0), 0);
    const { error } = await sb.from("pagos_socios").insert({
      id_pago: "PG" + String(max + 1).padStart(4, "0"),
      fecha: new Date().toISOString().slice(0, 10),
      socio: u.socio, id_producto: u.idProducto, id_lote: u.lote, tipo, monto: r2(monto),
      notas: (u.lote ? "Lote completo | " : "") + (tipo === "Costo" ? "Costo regresado" : "Ganancia pagada"),
    });
    setOcupado(null);
    if (error) setMsg(error.message); else cargar();
  }
  async function deshacer(u, tipo) {
    const ult = u.pagos.filter((g) => (tipo === "Costo" ? g.tipo === "Costo" : g.tipo !== "Costo")).sort((a, b) => String(b.id_pago).localeCompare(String(a.id_pago)))[0];
    if (!ult || !confirm(`¿Quitar el pago ${ult.id_pago} de ${mxn(ult.monto)}?`)) return;
    setOcupado(u.k + tipo); setMsg(null);
    const { error } = await sb.from("pagos_socios").delete().eq("id_pago", ult.id_pago);
    setOcupado(null);
    if (error) setMsg(error.message); else cargar();
  }
  async function guardarPct(v) {
    setPct(v);
    await sb.from("config").update({ valor: v }).eq("clave", "porcentaje_socio");
    cargar();
  }

  const Linea = ({ u, tipo, debe, pagado, falta }) => {
    const ok = Math.abs(falta) <= TOL;
    const lleva = falta > TOL;
    const sinVentas = u.productos.every((p) => n(p.vendidas) === 0); // nada vendido aún: el pago no tiene contra qué compararse
    return (
      <div className="rounded-lg border border-white/10 p-2 text-sm">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-white/70">{tipo === "Costo" ? "Costo que te regresa" : `Ganancia (${Math.round(pct * 100)}%)`}</span>
          <span className={ok ? "text-emerald-400" : lleva ? "font-semibold text-amber-400" : sinVentas ? "text-white/50" : "text-sky-300"}>
            {ok ? "✔ al corriente" : lleva ? `Falta ${mxn(falta)}` : sinVentas ? "Sin ventas capturadas aún" : `Pagado de más ${mxn(-falta)}`}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
          <span>Corresponde {mxn(debe)} · pagado {mxn(pagado)}</span>
          <span className="flex gap-3">
            {pagado > TOL && <button className="underline" disabled={ocupado === u.k + tipo} onClick={() => deshacer(u, tipo)}>Quitar último pago</button>}
          </span>
        </div>
        {lleva && (
          <button disabled={ocupado === u.k + tipo} onClick={() => pagar(u, tipo, falta)}
            className="mt-2 w-full rounded-lg border border-amber-500/60 py-2 text-amber-300 active:bg-amber-500/10">
            Ya pagué {mxn(falta)}
          </button>
        )}
      </div>
    );
  };

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

      {avisos.length > 0 && (
        <details className="card border-amber-500/40">
          <summary className="cursor-pointer text-sm text-amber-300">{avisos.length} avisos sobre los datos</summary>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {avisos.map((a, i) => (
              <li key={i}>{a.t} {a.a && <Link href={a.a} className="text-amber-400 underline">Corregir</Link>}</li>
            ))}
          </ul>
        </details>
      )}

      <section className="space-y-2">
        {resumen.map((s) => (
          <div key={s.socio} className="card">
            <div className="flex items-baseline justify-between">
              <span className="font-semibold">{s.socio}</span>
              <span className={s.debo > TOL ? "font-bold text-amber-400" : s.debo < -TOL ? "text-sky-300" : "text-emerald-400"}>
                {s.debo > TOL ? `Debo ${mxn(s.debo)}` : s.debo < -TOL ? `Pagado de más ${mxn(-s.debo)}` : "Al corriente"}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-2 text-xs text-white/50">
              <span>Su parte<br /><b className="text-white/80">{mxn(s.parte)}</b></span>
              <span>Costo por regresar<br /><b className="text-white/80">{mxn(s.cpr)}</b></span>
              <span>Pagado<br /><b className="text-white/80">{mxn(s.pagado)}</b></span>
            </div>
          </div>
        ))}
        {resumen.length === 0 && <p className="text-sm text-white/50">Aún no hay productos con socio.</p>}
      </section>

      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {nombres.map((nm) => (
            <button key={nm} onClick={() => setFiltro(nm)}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${filtro === nm ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{nm}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-white/60">
          <input type="checkbox" checked={alCorriente} onChange={(e) => setAlCorriente(e.target.checked)} /> Mostrar también los que ya están al corriente
        </label>
        {msg && <p className="text-sm text-red-300">{msg}</p>}

        {filas.map((u) => {
          const l = lineas(u);
          return (
            <div key={u.k} className="card space-y-2">
              <div>
                <div className="truncate">{u.nombre}</div>
                <div className="text-xs text-white/50">{u.socio}{u.productos.length > 1 ? ` · ${u.productos.length} productos` : ""}</div>
              </div>
              {l.tieneCosto && <Linea u={u} tipo="Costo" debe={u.debeCosto} pagado={u.pagCosto} falta={l.falCosto} />}
              {l.tieneGan && <Linea u={u} tipo="Ganancia" debe={u.parte} pagado={u.pagGan} falta={l.falGan} />}
            </div>
          );
        })}
        {filas.length === 0 && <p className="text-sm text-white/50">Nada pendiente con este filtro.</p>}
        <p className="text-xs text-white/40">
          Lo que corresponde se calcula con las ventas capturadas. Si capturas una venta después de haber pagado, solo te muestra lo que falta; nada se duplica.
        </p>
      </section>
    </div>
  );
}
