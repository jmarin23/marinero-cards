"use client";
import { useMemo, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList, PieChart, Pie, Sector, Treemap, ReferenceLine } from "recharts";
import { mxn, compacto } from "@/lib/format";
import { T } from "@/components/Resumen";
import Panel from "@/components/Panel";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (m, conAnio) => {
  const [a, mm] = String(m).split("-");
  return `${MES[Number(mm) - 1] || m}${conAnio ? ` ${String(a).slice(2)}` : ""}`;
};
const PALETA = ["#3b97e6", "#2bb8a3", "#e8743b", "#8b7bd8", "#e0a93b", "#d9648e", "#6b7078"];
const corto = (s, n = 22) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));

const Cuadro = ({ children }) => (
  <div className="rounded-md border px-3 py-2 text-xs shadow-lg" style={{ background: "#15171a", borderColor: "rgba(244,243,241,0.14)" }}>{children}</div>
);

function Toggle({ valor, opciones, onChange }) {
  return (
    <div className="flex shrink-0 gap-px rounded-md border border-white/10 p-0.5 text-xs">
      {opciones.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className="rounded-[3px] px-2.5 py-1"
          style={valor === v ? { background: "rgba(59,151,230,0.22)", color: T.tinta } : { color: T.apagado }}>{l}</button>
      ))}
    </div>
  );
}

const Llave = ({ color, texto }) => (
  <span className="inline-flex items-center gap-1.5 text-[0.6875rem]" style={{ color: T.tinta2 }}>
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{texto}
  </span>
);

// ---------- Ventas por mes: área con degradado, mensual o acumulado ----------
function VentasMes({ meses }) {
  const [modo, setModo] = useState("mes");
  const data = useMemo(() => {
    const anios = new Set(meses.map((m) => String(m.mes).slice(0, 4)));
    let acum = 0;
    return meses.map((m, i) => {
      const monto = Number(m.monto);
      acum += monto;
      const antes = i > 0 ? Number(meses[i - 1].monto) : null;
      return { mes: m.mes, nombre: etiquetaMes(m.mes, anios.size > 1), monto, acum, cambio: antes ? (monto - antes) / antes : null };
    });
  }, [meses]);
  if (!data.length) return <p className="text-sm" style={{ color: T.apagado }}>Aún no hay ventas con fecha.</p>;
  const k = modo === "mes" ? "monto" : "acum";
  const prom = data.reduce((t, d) => t + d.monto, 0) / data.length;
  const mejor = [...data].sort((a, b) => b.monto - a.monto)[0];
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Cuadro>
        <div style={{ color: T.apagado }}>{d.nombre}</div>
        <div className="text-base font-semibold" style={{ color: T.tinta }}>{mxn(modo === "mes" ? d.monto : d.acum)}</div>
        {modo === "mes" && d.cambio != null && <div style={{ color: d.cambio >= 0 ? T.bueno : T.rojo }}>{d.cambio >= 0 ? "▲" : "▼"} {Math.abs(Math.round(d.cambio * 100))}% vs mes anterior</div>}
        {modo === "acum" && <div style={{ color: T.tinta2 }}>ese mes: {mxn(d.monto)}</div>}
      </Cuadro>
    );
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: T.apagado }}>Mejor mes: <b style={{ color: T.tinta }}>{mejor.nombre}</b> · {compacto(mejor.monto)} · promedio {compacto(prom)}</p>
        <Toggle valor={modo} onChange={setModo} opciones={[["mes", "Por mes"], ["acum", "Acumulado"]]} />
      </div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.azul} stopOpacity={0.5} />
                <stop offset="100%" stopColor={T.azul} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={T.rejilla} />
            <XAxis dataKey="nombre" tickLine={false} axisLine={{ stroke: T.base }} tick={{ fill: T.apagado, fontSize: 12.5 }} />
            <YAxis tickLine={false} axisLine={false} width={46} tick={{ fill: T.apagado, fontSize: 12.5 }} tickFormatter={(v) => (v === 0 ? "0" : compacto(v).replace("$", ""))} />
            <Tooltip content={<Tip />} cursor={{ stroke: T.apagado, strokeDasharray: "3 3" }} />
            {modo === "mes" && <ReferenceLine y={prom} stroke={T.apagado} strokeDasharray="4 4" />}
            <Area type="monotone" dataKey={k} stroke={T.azul} strokeWidth={2.5} fill="url(#gVentas)"
              dot={{ r: 3, fill: T.azul, stroke: T.superficie, strokeWidth: 1.5 }} activeDot={{ r: 6, fill: T.azul, stroke: T.superficie, strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------- Ganancia por lote: barras horizontales, en $ o en % sobre el costo ----------
function GananciaLote({ lotes }) {
  const [metrica, setMetrica] = useState("ganancia");
  const [todos, setTodos] = useState(false);
  const data = useMemo(() => lotes.map((l) => ({ ...l, pct: l.costo > 0 ? (l.ganancia / l.costo) * 100 : 0 })).sort((a, b) => b[metrica] - a[metrica]), [lotes, metrica]);
  if (!data.length) return <p className="text-sm" style={{ color: T.apagado }}>Aún no hay lotes con costo.</p>;
  const peor = data.filter((d) => d[metrica] < 0).slice(-1);
  const mostrar = todos ? data : [...data.slice(0, 7), ...peor.filter((p) => !data.slice(0, 7).includes(p))];
  const vmax = Math.max(...mostrar.map((d) => d[metrica]), 0);
  const vmin = Math.min(...mostrar.map((d) => d[metrica]), 0);
  const dMax = vmax;
  const dMin = vmin < 0 ? vmin - Math.max(vmax, 1) * 0.32 : 0;
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Cuadro>
        <div className="font-semibold" style={{ color: T.tinta }}>{d.nombre}</div>
        <div style={{ color: d.ganancia < 0 ? T.rojo : T.bueno }}>Ganancia {mxn(d.ganancia)}</div>
        <div style={{ color: T.tinta2 }}>Costo {mxn(d.costo)} · {d.pct >= 0 ? "+" : "−"}{Math.abs(Math.round(d.pct))}%</div>
      </Cuadro>
    );
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-x-3"><Llave color={T.azul} texto="Ganancia" />{data.some((d) => d.ganancia < 0) && <Llave color={T.rojo} texto="Pérdida" />}</div>
        <Toggle valor={metrica} onChange={setMetrica} opciones={[["ganancia", "En $"], ["pct", "En %"]]} />
      </div>
      <div style={{ height: mostrar.length * 34 + 16 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={mostrar} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 4 }} barCategoryGap={6}>
            <XAxis type="number" hide domain={[dMin, dMax]} />
            <YAxis type="category" dataKey="nombre" width={128} tickLine={false} axisLine={false} tick={{ fill: T.tinta2, fontSize: 12.5 }} tickFormatter={(v) => corto(v, 19)} interval={0} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(244,243,241,0.05)" }} />
            <ReferenceLine x={0} stroke={T.base} />
            <Bar dataKey={metrica} radius={[0, 3, 3, 0]} maxBarSize={20}>
              {mostrar.map((d) => <Cell key={d.nombre} fill={d.ganancia < 0 ? T.rojo : T.azul} />)}
              <LabelList dataKey={metrica} content={(p) => {
                const v = Number(p.value);
                const x = v < 0 ? p.x - 6 : p.x + p.width + 6;
                return <text x={x} y={p.y + p.height / 2} dy="0.35em" textAnchor={v < 0 ? "end" : "start"} fill={v < 0 ? T.rojo : T.tinta2} fontSize={12}>{metrica === "ganancia" ? compacto(v) : `${Math.round(v)}%`}</text>;
              }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {data.length > mostrar.length || todos ? (
        <button className="mt-1 text-xs" style={{ color: T.tinta2 }} onClick={() => setTodos((t) => !t)}>{todos ? "Ver menos" : `Ver los ${data.length} lotes`}</button>
      ) : null}
    </div>
  );
}

// ---------- Ventas por canal: dona interactiva ----------
const COLOR_CANAL = { TikTok: T.azul, Externa: T.naranja, "Mercado Libre": T.aqua };
function Canales({ canales }) {
  const [act, setAct] = useState(null);
  const filas = useMemo(() => [...canales].filter((c) => c.monto > 0).sort((a, b) => b.monto - a.monto), [canales]);
  if (!filas.length) return <p className="text-sm" style={{ color: T.apagado }}>Sin ventas todavía.</p>;
  const suma = filas.reduce((t, c) => t + c.monto, 0) || 1;
  const color = (c, i) => COLOR_CANAL[c] || PALETA[(i + 3) % PALETA.length];
  const sel = act != null ? filas[act] : null;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={filas} dataKey="monto" nameKey="canal" innerRadius="66%" outerRadius="94%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}
              onMouseEnter={(_, i) => setAct(i)} onMouseLeave={() => setAct(null)}
              shape={(p) => <Sector {...p} outerRadius={p.outerRadius + (act === p.index ? 6 : 0)} fillOpacity={act == null || act === p.index ? 1 : 0.35} />}>
              {filas.map((c, i) => <Cell key={c.canal} fill={color(c.canal, i)} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[0.6875rem]" style={{ color: T.apagado }}>{sel ? sel.canal : "Total vendido"}</div>
            <div className="text-xl font-semibold" style={{ color: T.tinta }}>{compacto(sel ? sel.monto : suma)}</div>
            {sel && <div className="text-xs" style={{ color: T.apagado }}>{Math.round((sel.monto / suma) * 100)}%</div>}
          </div>
        </div>
      </div>
      <ul className="w-full space-y-1">
        {filas.map((c, i) => (
          <li key={c.canal} onMouseEnter={() => setAct(i)} onMouseLeave={() => setAct(null)}
            className="flex cursor-default items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm transition-colors"
            style={{ background: act === i ? "rgba(244,243,241,0.06)" : "transparent" }}>
            <span className="flex items-center gap-2" style={{ color: T.tinta2 }}><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color(c.canal, i) }} />{c.canal}</span>
            <span className="tabular-nums" style={{ color: T.tinta }}>{mxn(c.monto)} <span className="ml-1.5 text-[0.6875rem]" style={{ color: T.apagado }}>{Math.round((c.monto / suma) * 100)}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Inventario por categoría: mapa de cajas (treemap) ----------
function Categorias({ categorias }) {
  const data = useMemo(() => [...categorias].filter((c) => c.costo > 0).sort((a, b) => b.costo - a.costo).map((c, i) => ({ name: c.categoria, size: c.costo, i })), [categorias]);
  if (!data.length) return <p className="text-sm" style={{ color: T.apagado }}>Sin inventario.</p>;
  const total = data.reduce((t, d) => t + d.size, 0);
  const Caja = (p) => {
    const { x, y, width, height, name, size, index } = p;
    if (width < 2 || height < 2 || name == null) return null;
    const chico = width < 70 || height < 44;
    return (
      <g>
        <rect x={x + 1.5} y={y + 1.5} width={Math.max(width - 3, 0)} height={Math.max(height - 3, 0)} rx={4} fill={PALETA[index % PALETA.length]} fillOpacity={0.88} />
        {!chico && (
          <>
            <text x={x + 10} y={y + 22} fill="#fff" fontSize={13} fontWeight={600}>{corto(name, Math.floor(width / 8))}</text>
            <text x={x + 10} y={y + 40} fill="#fff" fillOpacity={0.85} fontSize={12}>{compacto(size)} · {Math.round((size / total) * 100)}%</text>
          </>
        )}
      </g>
    );
  };
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return <Cuadro><div className="font-semibold" style={{ color: T.tinta }}>{d.name}</div><div style={{ color: T.tinta2 }}>{mxn(d.size)} a costo · {Math.round((d.size / total) * 100)}%</div></Cuadro>;
  };
  return (
    <div style={{ height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap data={data} dataKey="size" nameKey="name" stroke="none" content={<Caja />} isAnimationActive>
          <Tooltip content={<Tip />} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

export default function Charts({ lotes, canales, meses, categorias }) {
  return (
    <>
      <Panel className="lg:col-span-2" titulo="Ventas por mes" sub="Pasa el mouse sobre un mes para ver el detalle"><VentasMes meses={meses} /></Panel>
      <Panel titulo="Ganancia por lote" sub="Los mejores lotes, y el peor si hay pérdida"><GananciaLote lotes={lotes} /></Panel>
      <Panel titulo="Ventas por canal" sub="Todo lo vendido (sin reembolsos)"><Canales canales={canales} /></Panel>
      <Panel titulo="Inventario por categoría" sub="Costo de lo que sigue en bodega"><Categorias categorias={categorias} /></Panel>
    </>
  );
}
