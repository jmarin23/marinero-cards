import { mxn, compacto } from "@/lib/format";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m) => MES[Number(String(m).split("-")[1]) - 1] || m;

// Tokens del tablero (oscuro, estilo Power BI)
export const T = {
  azul: "#3b97e6", azulSuave: "#1f66ad", rojo: "#f0706d", naranja: "#e8743b", aqua: "#2bb8a3",
  tinta: "#f4f3f1", tinta2: "#c9c7c3", apagado: "#8e8c88", rejilla: "rgba(244,243,241,0.07)", base: "#3a3c40", superficie: "#1b1d20", bueno: "#4cc38a",
};

const num = (x) => Number(x || 0);

function Sparkline({ valores }) {
  if (valores.length < 2) return <div className="h-8" />;
  const W = 120, H = 32, p = 4;
  const max = Math.max(...valores), min = Math.min(...valores), rango = max - min || 1;
  const pts = valores.map((v, i) => [p + (i * (W - 2 * p)) / (valores.length - 1), H - p - ((v - min) / rango) * (H - 2 * p)]);
  const linea = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [ux, uy] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={`${linea} L${ux.toFixed(1)} ${H} L${pts[0][0].toFixed(1)} ${H} Z`} fill={T.azul} opacity="0.10" />
      <path d={linea} fill="none" stroke={T.azulSuave} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={ux} cy={uy} r="4" fill={T.azul} stroke={T.superficie} strokeWidth="2" />
    </svg>
  );
}

function Kpi({ label, value, acento, delta, deltaBueno, sub, spark, barra }) {
  return (
    <div className="flex flex-col rounded-md border border-white/10 p-4" style={{ background: T.superficie, borderTop: `2px solid ${acento}` }}>
      <div className="text-[12px]" style={{ color: T.apagado }}>{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight" style={{ color: T.tinta }}>{value}</div>
      {delta != null && (
        <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium" style={{ color: deltaBueno ? T.bueno : T.rojo }}>
          <span aria-hidden>{deltaBueno ? "▲" : "▼"}</span>{delta}
        </div>
      )}
      {barra != null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-sm" style={{ background: "rgba(59,151,230,0.18)" }}>
          <div className="h-full" style={{ width: `${Math.min(100, barra * 100)}%`, background: T.azul }} />
        </div>
      )}
      {spark ? <div className="mt-2"><Sparkline valores={spark} /></div> : null}
      {sub && <div className="mt-auto pt-2 text-[11px]" style={{ color: T.apagado }}>{sub}</div>}
    </div>
  );
}

export default function Resumen({ r, meses }) {
  const posicion = num(r.posicion), roi = num(r.roi), invertido = num(r.total_invertido), vendido = num(r.total_vendido);
  const recuperado = invertido > 0 ? vendido / invertido : 0;
  const sube = posicion >= 0;
  const serie = meses.slice(-12).map((m) => m.monto);
  const mesActual = meses.length ? meses[meses.length - 1] : null;

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi label="Posición del negocio" value={mxn(posicion)} acento={sube ? T.azul : T.rojo} delta={`${(roi * 100).toFixed(1)}% ROI`} deltaBueno={sube}
        sub="Vendido + inventario a costo − invertido" />
      <Kpi label="Vendido" value={compacto(vendido)} acento={T.aqua} spark={serie} sub={mesActual ? `${nombreMes(mesActual.mes)}: ${compacto(mesActual.monto)}` : null} />
      <Kpi label="Invertido" value={compacto(invertido)} acento={T.naranja} barra={recuperado} sub={`${Math.round(recuperado * 100)}% recuperado con ventas`} />
      <Kpi label="Inventario a costo" value={compacto(r.inventario_a_costo)} acento={T.azulSuave} sub="Lo que sigue en bodega" />
    </section>
  );
}
