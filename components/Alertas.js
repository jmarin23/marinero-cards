import { mxn, compacto } from "@/lib/format";
import { T } from "@/components/Resumen";

const num = (x) => Number(x || 0);
const TRAMOS = [
  { k: "30–60 días", op: 0.45, dentro: (d) => d <= 60 },
  { k: "60–90 días", op: 0.72, dentro: (d) => d > 60 && d <= 90 },
  { k: "Más de 90 días", op: 1, dentro: (d) => d > 90 },
];

// Alertas compactas: una barra con el dinero parado por antigüedad; el detalle queda plegado.
export default function Alertas({ estancados = [], perdidas = [] }) {
  if (!estancados.length && !perdidas.length) return null;
  const total = estancados.reduce((t, p) => t + num(p.costo_inventario), 0);
  const tramos = TRAMOS.map((t) => ({ ...t, monto: estancados.filter((p) => t.dentro(num(p.dias_en_inventario))).reduce((a, p) => a + num(p.costo_inventario), 0) }));
  const perdidaTotal = perdidas.reduce((t, l) => t + num(l.ganancia_real), 0);
  const top = [...estancados].sort((a, b) => num(b.costo_inventario) - num(a.costo_inventario));
  const maxTop = num(top[0]?.costo_inventario) || 1;
  const maxPerd = Math.max(...perdidas.map((l) => Math.abs(num(l.ganancia_real))), 1);

  return (
    <details className="group rounded-xl border border-white/10" style={{ background: T.superficie }}>
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold" style={{ color: T.tinta }}>Alertas</h2>
          <span className="text-xs transition-transform group-open:rotate-180" style={{ color: T.apagado }}>▾</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {perdidas.length > 0 && (
            <span className="rounded-full px-2.5 py-1" style={{ background: "rgba(230,103,103,0.14)", color: T.rojo }}>
              {perdidas.length} lote{perdidas.length === 1 ? "" : "s"} con pérdida · {compacto(perdidaTotal)}
            </span>
          )}
          {estancados.length > 0 && (
            <span className="rounded-full px-2.5 py-1" style={{ background: "rgba(217,89,38,0.16)", color: "#f0a07a" }}>
              {estancados.length} producto{estancados.length === 1 ? "" : "s"} sin moverse · {compacto(total)} parados
            </span>
          )}
        </div>
        {total > 0 && (
          <div className="mt-3">
            <div className="flex h-2.5 w-full gap-[2px]" role="img" aria-label="Dinero parado en inventario por antigüedad">
              {tramos.filter((t) => t.monto > 0).map((t, i, a) => (
                <div key={t.k} title={`${t.k}: ${mxn(t.monto)}`}
                  style={{ width: `${(t.monto / total) * 100}%`, background: T.naranja, opacity: t.op, borderRadius: i === 0 ? "4px 0 0 4px" : i === a.length - 1 ? "0 4px 4px 0" : 0 }} />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]" style={{ color: T.apagado }}>
              {tramos.filter((t) => t.monto > 0).map((t) => (
                <span key={t.k} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: T.naranja, opacity: t.op }} />{t.k} <span style={{ color: T.tinta2 }}>{compacto(t.monto)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </summary>

      <div className="space-y-4 border-t border-white/10 p-4">
        {perdidas.length > 0 && (
          <div>
            <div className="mb-1 text-xs" style={{ color: T.apagado }}>Lotes con pérdida</div>
            {perdidas.map((l) => (
              <div key={l.id_lote} className="py-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate" style={{ color: T.tinta2 }}>{l.nombre}</span>
                  <span className="shrink-0 font-medium tabular-nums" style={{ color: T.rojo }}>{mxn(l.ganancia_real)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm" style={{ background: T.rejilla }}>
                  <div className="h-full rounded-r-sm" style={{ width: `${Math.max((Math.abs(num(l.ganancia_real)) / maxPerd) * 100, 2)}%`, background: T.rojo }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {top.length > 0 && (
          <div>
            <div className="mb-1 text-xs" style={{ color: T.apagado }}>Lo que más dinero tiene parado (más de 30 días sin venderse)</div>
            {top.slice(0, 8).map((p) => (
              <div key={p.id_producto} className="py-1.5">
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate" style={{ color: T.tinta2 }}>{p.nombre} <span style={{ color: T.apagado }}>×{num(p.inventario)} · {num(p.dias_en_inventario)} d</span></span>
                  <span className="shrink-0 font-medium tabular-nums" style={{ color: T.tinta }}>{mxn(p.costo_inventario)}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-sm" style={{ background: T.rejilla }}>
                  <div className="h-full rounded-r-sm" style={{ width: `${Math.max((num(p.costo_inventario) / maxTop) * 100, 2)}%`, background: T.naranja }} />
                </div>
              </div>
            ))}
            {top.length > 8 && <p className="pt-1 text-xs" style={{ color: T.apagado }}>y {top.length - 8} más · en Inventario puedes verlos todos</p>}
          </div>
        )}
      </div>
    </details>
  );
}
