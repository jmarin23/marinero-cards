import { supabaseServer } from "@/lib/supabase/server";
import { analizar } from "@/lib/analisis";
import { mxn, compacto } from "@/lib/format";
import Panel from "@/components/Panel";
import { T } from "@/components/Resumen";
import { VentasVsCompras, MargenCategoria, Antiguedad } from "@/components/AnalisisCharts";

export const dynamic = "force-dynamic";

// Trae todas las filas aunque pasen de 1000
async function todo(sb, tabla, cols) {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const { data, error } = await sb.from(tabla).select(cols).range(i * 1000, i * 1000 + 999);
    if (error || !data) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const pctS = (x) => (x == null ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`);
const color = (x) => (x == null ? "text-white/50" : x < 0 ? "text-red-400" : "text-emerald-400");
const TONO = { bueno: "#4cc38a", alerta: "#f0706d", info: "#3b97e6" };

function Tabla({ cols, filas, vacio }) {
  if (!filas.length) return <p className="text-sm text-white/50">{vacio}</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-white/10 text-[0.6875rem] uppercase tracking-wide text-white/45">
            {cols.map((c, i) => <th key={i} className={`py-2 pr-3 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, r) => (
            <tr key={r} className="border-b border-white/5 last:border-0">
              {f.map((c, i) => <td key={i} className={`py-2 pr-3 tabular-nums ${i === 0 ? "text-left" : "text-right"} ${c && c.cls ? c.cls : ""}`}>{c && c.v !== undefined ? c.v : c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Analisis() {
  const sb = supabaseServer();
  const [productos, ventas, lotes, cfg] = await Promise.all([
    todo(sb, "v_productos", "id_producto,id_lote,nombre,categoria,cantidad,costo_total,fecha_compra,creado_en,vendidas,venta_total,inventario,costo_unitario,costo_inventario,ultima_venta,dias_en_inventario"),
    todo(sb, "ventas", "id_venta,fecha,id_producto,id_lote,canal,cantidad,monto_neto,estado"),
    todo(sb, "v_lotes", "*"),
    sb.from("config").select("clave,valor"),
  ]);
  const config = Object.fromEntries((cfg.data || []).map((c) => [c.clave, c.valor]));
  const a = analizar({ productos, ventas, lotes, config });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Análisis</h1>
        <span className="text-xs text-white/40">{productos.length} productos · {ventas.length} ventas</span>
      </div>

      <Panel titulo="Lo que sale de tus datos" sub="Se recalcula solo con cada venta o compra que captures">
        {a.hallazgos.length === 0 ? (
          <p className="text-sm text-white/50">Todavía no hay suficientes ventas para sacar conclusiones.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {a.hallazgos.map((h, i) => (
              <div key={i} className="rounded-md border border-white/10 py-2.5 pl-3 pr-3" style={{ borderLeft: `3px solid ${TONO[h.tono]}`, background: "rgba(244,243,241,0.02)" }}>
                <div className="text-sm font-semibold" style={{ color: T.tinta }}>{h.titulo}</div>
                <div className="mt-0.5 text-[0.8125rem] leading-snug" style={{ color: T.tinta2 }}>{h.texto}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel titulo="Ventas contra compras por mes" sub="Cuánto metiste a mercancía y cuánto recuperaste cada mes"><VentasVsCompras meses={a.meses} /></Panel>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel titulo="Margen por categoría" sub="Ganancia sobre el costo de lo que ya vendiste"><MargenCategoria categorias={a.categorias} /></Panel>
        <Panel titulo="Antigüedad del inventario" sub="Dinero en bodega según los días que lleva ahí"><Antiguedad buckets={a.antiguedad} /></Panel>
      </div>

      <Panel titulo="Categorías" sub="Qué has comprado, qué ha salido y qué tan rápido">
        <Tabla
          cols={["Categoría", "Invertido", "Vendido", "Margen", "Salió", "Días a 1ª venta", "En bodega"]}
          vacio="Sin productos."
          filas={a.categorias.map((c) => [
            c.categoria, mxn(c.invertido), mxn(c.venta),
            { v: pctS(c.margenPct), cls: color(c.margenPct) },
            `${Math.round(c.rotacion * 100)}%`,
            c.diasPrimeraVenta == null ? "—" : Math.round(c.diasPrimeraVenta),
            mxn(c.invCosto),
          ])}
        />
      </Panel>

      <Panel titulo="Lotes" sub="Ordenados por ROI. Recuperado = lo vendido entre lo que costó el lote">
        <Tabla
          cols={["Lote", "Costo", "Vendido", "Recuperado", "Ganancia", "ROI", "Piezas"]}
          vacio="Sin lotes."
          filas={a.lotes.map((l) => [
            l.nombre, mxn(l.costo), mxn(l.venta),
            { v: `${Math.round(l.recuperado * 100)}%`, cls: l.recuperado >= 1 ? "text-emerald-400" : "" },
            { v: mxn(l.ganancia), cls: color(l.ganancia) },
            { v: pctS(l.roi), cls: color(l.roi) },
            l.pzas,
          ])}
        />
        <p className="mt-3 text-xs text-white/45">Ganancia y ROI cuentan el inventario que sigue en bodega a precio de costo, así que un lote con piezas sin vender se ve más bajo de lo que acabará.</p>
      </Panel>

      <Panel titulo="Producto parado" sub={`Más de 30 días en bodega y sin venta reciente · ${compacto(a.capitalAtrapado)} atrapados`}>
        <Tabla
          cols={["Producto", "Piezas", "A costo", "Días", "Costo c/u", "Mínimo en TikTok"]}
          vacio="Nada parado, todo se está moviendo."
          filas={a.estancados.slice(0, 15).map((p) => [p.nombre, p.pzas, mxn(p.invCosto), p.dias, mxn(p.costoUnit), mxn(p.minTikTok)])}
        />
        <p className="mt-3 text-xs text-white/45">
          Mínimo en TikTok es el precio publicado con el que sales en tablas: costo más ${a.fijo} fijos, entre 1 menos {(a.comision * 100).toFixed(2)}% de comisión. Por debajo de eso, rematar es perder dinero.
          {a.estancados.length > 15 ? ` Se muestran 15 de ${a.estancados.length}.` : ""}
        </p>
      </Panel>

      <Panel titulo="Canales" sub="Dónde vendes y qué tanto se te regresa">
        <Tabla
          cols={["Canal", "Vendido", "% del total", "Ticket prom.", "Reembolsos", "En espera", "Sin empatar"]}
          vacio="Sin ventas."
          filas={a.canales.map((c) => [
            c.canal, mxn(c.monto), `${Math.round(c.parte * 100)}%`, mxn(c.ticket),
            { v: `${c.reembolsos} (${Math.round(c.reembPct * 100)}%)`, cls: c.reembPct >= 0.05 ? "text-red-400" : "" },
            mxn(c.enEspera), mxn(c.sinEmpatar),
          ])}
        />
      </Panel>

      <p className="pb-2 text-xs text-white/40">Margen = (vendido − costo de lo vendido) / costo de lo vendido, sin contar lo que sigue en bodega. Las categorías con pocas piezas vendidas se ven en las tablas pero no entran a los hallazgos.</p>
    </div>
  );
}
