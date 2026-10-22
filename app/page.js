import PanelPagos from "@/components/PanelPagos";
import { supabaseServer } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import Resumen from "@/components/Resumen";
import Link from "next/link";
import Charts from "@/components/Charts";

export const dynamic = "force-dynamic";

export default async function Tablero() {
  const sb = supabaseServer();
  const [resumen, lotes, canales, meses, cats, estancados, perdidas, porRevisar] = await Promise.all([
    sb.from("v_resumen").select("*").single(),
    sb.from("v_lotes").select("*"),
    sb.from("v_ventas_canal").select("*"),
    sb.from("v_ventas_mes").select("*"),
    sb.from("v_inventario_categoria").select("*"),
    sb.from("v_alertas_estancados").select("*").order("costo_inventario", { ascending: false }).limit(15),
    sb.from("v_alertas_lotes_perdida").select("*"),
    sb.from("ventas").select("id_venta", { count: "exact", head: true }).or('estado.eq.Revisar,canal.is.null,and(id_producto.is.null,or(id_lote.is.null,id_lote.neq.EXT)),cliente_notas.ilike.*Revisar:*'),
  ]);
  const r = resumen.data || {};
  const num = (x) => Number(x || 0);

  const dataLotes = (lotes.data || [])
    .filter((l) => num(l.costo) > 0)
    .map((l) => ({ nombre: l.nombre, ganancia: num(l.ganancia_real), costo: num(l.costo) }));
  const dataCanales = (canales.data || []).map((c) => ({ canal: c.canal, monto: num(c.monto) }));
  const dataMeses = (meses.data || []).map((m) => ({ mes: m.mes, monto: num(m.monto) }));
  const dataCats = (cats.data || []).map((c) => ({ categoria: c.categoria, costo: num(c.costo) }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tablero</h1>

      <Resumen r={r} meses={dataMeses} />

      {porRevisar.count > 0 && (
        <Link href="/revisar" className="card block border-amber-500/40 text-amber-300 active:bg-white/10">
          {porRevisar.count} ventas por corregir (sin producto, sin canal o con aviso) →
        </Link>
      )}

      <PanelPagos />

      {(estancados.data?.length > 0 || perdidas.data?.length > 0) && (
        <section className="card space-y-3">
          <h2 className="text-sm font-semibold text-white/80">Alertas</h2>
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
