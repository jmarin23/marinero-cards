import { mxn, compacto } from "@/lib/format";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (m) => MES[Number(String(m).split("-")[1]) - 1] || m;

// Tokens del tablero (modo oscuro, validados contra la superficie de las tarjetas)
export const T = {
  azul: "#3987e5", azulSuave: "#1c5cab", rojo: "#e66767", naranja: "#d95926", aqua: "#199e70",
  tinta: "#f0efec", tinta2: "#c3c2b7", apagado: "#898781", rejilla: "rgba(255,255,255,0.07)", base: "#383835", superficie: "#1b1f24", bueno: "#0ca30c",
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

function Tile({ label, value, sub, spark }) {
  return (
    <div className="rounded-xl border border-white/10 p-3" style={{ background: T.superficie }}>
      <div className="text-xs" style={{ color: T.apagado }}>{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight" style={{ color: T.tinta }}>{value}</div>
      {spark ? <div className="mt-2"><Sparkline valores={spark} /></div> : null}
      {sub && <div className="mt-1 text-[11px]" style={{ color: T.apagado }}>{sub}</div>}
    </div>
  );
}

// Cifra principal + tarjetas de apoyo. Sin gráficas pesadas: lo importante se lee en un segundo.
export default function Resumen({ r, meses }) {
  const posicion = num(r.posicion), roi = num(r.roi), invertido = num(r.total_invertido), vendido = num(r.total_vendido);
  const recuperado = invertido > 0 ? vendido / invertido : 0;
  const sube = posicion >= 0;
  const serie = meses.slice(-12).map((m) => m.monto);
  const mesActual = meses.length ? meses[meses.length - 1] : null;

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-white/10 p-5" style={{ background: T.superficie }}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm" style={{ color: T.apagado }}>Posición del negocio</div>
          <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium"
            style={{ borderColor: sube ? "rgba(12,163,12,0.45)" : "rgba(230,103,103,0.5)", color: sube ? T.bueno : T.rojo }}>
            <span aria-hidden>{sube ? "▲" : "▼"}</span>{(roi * 100).toFixed(1)}% ROI
          </span>
        </div>
        <div className="mt-2 text-[48px] font-semibold leading-none tracking-tight sm:text-[56px]" style={{ color: sube ? T.tinta : T.rojo }}>
          {mxn(posicion)}
        </div>
        <p className="mt-2 text-xs" style={{ color: T.apagado }}>Lo vendido + lo que queda en inventario a costo − lo invertido</p>

        <div className="mt-5">
          <div className="flex items-baseline justify-between text-xs">
            <span style={{ color: T.tinta2 }}>Inversión recuperada con ventas</span>
            <span style={{ color: T.tinta }} className="font-medium">{Math.round(recuperado * 100)}%</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(57,135,229,0.18)" }} role="img" aria-label={`Recuperado ${Math.round(recuperado * 100)}%`}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, recuperado * 100)}%`, background: T.azul }} />
          </div>
          <div className="mt-1.5 text-[11px]" style={{ color: T.apagado }}>{mxn(vendido)} vendido de {mxn(invertido)} invertido</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tile label="Vendido" value={compacto(vendido)} spark={serie} sub={mesActual ? `${nombreMes(mesActual.mes)}: ${compacto(mesActual.monto)}` : null} />
        <Tile label="Invertido" value={compacto(invertido)} />
        <Tile label="Inventario a costo" value={compacto(r.inventario_a_costo)} />
      </div>
    </section>
  );
}
