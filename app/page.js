import { supabaseServer } from "@/lib/supabase/server";
import { mxn, pct } from "@/lib/format";
import Charts from "@/components/Charts";

export const dynamic = "force-dynamic";

function Stat({ label, value, tone }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-amber-400"}`}>{value}</div>
    </div>
  );
}

export default async function Tablero() {
  const sb = supabaseServer();
  const [resumen, lotes, canales, meses, cats, estancados, perdidas] = await Promise.all([
    sb.from("v_resumen").select("*").single(),
    sb.from("v_lotes").select("*"),
    sb.from("v_ventas_canal").select("*"),
    sb.from("v_ventas_mes").select("*"),
    sb.from("v_inventario_categoria").select("*"),
    sb.from("v_alertas_estancados").select("*").order("costo_inventario", { ascending: false }).limit(15),
    sb.from("v_alertas_lotes_perdida").select("*"),
  ]);
  const r = resumen.data || {};
  const num = (x) => Number(x || 0);

  const dataLotes = (lotes.data || [])
    .filter((l) => num(l.costo) > 0)
    .map((l) => ({ nombre: l.nombre.slice(0, 22), ganancia: num(l.ganancia_real) }));
  const dataCanales = (canales.data || []).map((c) => ({ canal: c.canal, monto: num(c.monto) }));
  const dataMeses = (meses.data || []).map((m) => ({ mes: m.mes, monto: num(m.monto) }));
  const dataCats = (cats.data || []).map((c) => ({ categoria: c.categoria, costo: num(c.costo) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tablero</h1>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Invertido" value={mxn(r.total_invertido)} />
        <Stat label="Vendido" value={mxn(r.total_vendido)} />
        <Stat label="Inventario a costo" value={mxn(r.inventario_a_costo)} />
        <Stat label="Posición" value={mxn(r.posicion)} tone={num(r.posicion) >= 0 ? "good" : "bad"} />
        <div className="col-span-2"><Stat label="ROI" value={pct(r.roi)} tone={num(r.roi) >= 0 ? "good" : "bad"} /></div>
      </div>

      {(estancados.data?.length > 0 || perdidas.data?.length > 0) && (
        <section className="card space-y-3 border-amber-500/40">
          <h2 className="font-semibold text-amber-400">Alertas</h2>
          {perdidas.data?.length > 0 && (
            <div>
              <div className="text-sm text-white/60">Lotes con pérdida</div>
              {perdidas.data.map((l) => (
                <div key={l.id_lote} className="flex justify-between py-1 text-sm">
                  <span>{l.nombre}</span><span className="text-red-400">{mxn(l.ganancia_real)}</span>
                </div>
              ))}
            </div>
          )}
          {estancados.data?.length > 0 && (
            <div>
              <div className="text-sm text-white/60">Más de 30 días sin venderse</div>
              {estancados.data.map((p) => (
                <div key={p.id_producto} className="flex justify-between gap-3 py-1 text-sm">
                  <span className="truncate">{p.nombre} <span className="text-white/40">×{num(p.inventario)}</span></span>
                  <span className="shrink-0 text-white/70">{mxn(p.costo_inventario)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <Charts lotes={dataLotes} canales={dataCanales} meses={dataMeses} categorias={dataCats} />
    </div>
  );
}
