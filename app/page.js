import PanelPagos from "@/components/PanelPagos";
import { supabaseServer } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import Resumen from "@/components/Resumen";
import Link from "next/link";
import Charts from "@/components/Charts";
import Alertas from "@/components/Alertas";

export const dynamic = "force-dynamic";

export default async function Tablero() {
  const sb = supabaseServer();
  const [resumen, lotes, canales, meses, cats, estancados, perdidas, porRevisar] = await Promise.all([
    sb.from("v_resumen").select("*").single(),
    sb.from("v_lotes").select("*"),
    sb.from("v_ventas_canal").select("*"),
    sb.from("v_ventas_mes").select("*"),
    sb.from("v_inventario_categoria").select("*"),
    sb.from("v_alertas_estancados").select("*").order("costo_inventario", { ascending: false }).range(0, 999),
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

      <Charts lotes={dataLotes} canales={dataCanales} meses={dataMeses} categorias={dataCats} />

      <Alertas estancados={estancados.data || []} perdidas={perdidas.data || []} />
    </div>
  );
}
