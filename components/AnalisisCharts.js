"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList, ReferenceLine } from "recharts";
import { mxn, compacto } from "@/lib/format";
import { T } from "@/components/Resumen";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etq = (m) => { const [a, mm] = String(m).split("-"); return `${MES[Number(mm) - 1] || m} ${String(a).slice(2)}`; };
const Cuadro = ({ children }) => (
  <div className="rounded-md border px-3 py-2 text-xs shadow-lg" style={{ background: "#15171a", borderColor: "rgba(244,243,241,0.14)" }}>{children}</div>
);
const Llave = ({ color, texto }) => (
  <span className="inline-flex items-center gap-1.5 text-[0.6875rem]" style={{ color: T.tinta2 }}>
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{texto}
  </span>
);

// Cuánto vendiste contra cuánto compraste cada mes
export function VentasVsCompras({ meses }) {
  const data = meses.map((m) => ({ ...m, nombre: etq(m.mes) }));
  if (!data.length) return <p className="text-sm" style={{ color: T.apagado }}>Sin datos todavía.</p>;
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Cuadro>
        <div style={{ color: T.apagado }}>{d.nombre}</div>
        <div style={{ color: T.azul }}>Vendiste {mxn(d.ventas)}</div>
        <div style={{ color: T.naranja }}>Compraste {mxn(d.inversion)}</div>
        <div style={{ color: d.ventas - d.inversion >= 0 ? T.bueno : T.rojo }}>Diferencia {mxn(d.ventas - d.inversion)}</div>
      </Cuadro>
    );
  };
  return (
    <div>
      <div className="mb-2 flex gap-x-4"><Llave color={T.azul} texto="Ventas" /><Llave color={T.naranja} texto="Compras (costo)" /></div>
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid vertical={false} stroke={T.rejilla} />
            <XAxis dataKey="nombre" tickLine={false} axisLine={{ stroke: T.base }} tick={{ fill: T.apagado, fontSize: 12.5 }} />
            <YAxis tickLine={false} axisLine={false} width={46} tick={{ fill: T.apagado, fontSize: 12.5 }} tickFormatter={(v) => (v === 0 ? "0" : compacto(v).replace("$", ""))} />
            <Tooltip content={<Tip />} cursor={{ fill: "rgba(244,243,241,0.05)" }} />
            <Bar dataKey="ventas" fill={T.azul} radius={[3, 3, 0, 0]} maxBarSize={26} />
            <Bar dataKey="inversion" fill={T.naranja} radius={[3, 3, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// Margen sobre costo de lo ya vendido, por categoría
export function MargenCategoria({ categorias }) {
  const data = categorias.filter((c) => c.margenPct != null && c.vendidas > 0).map((c) => ({ ...c, v: c.margenPct * 100 })).sort((a, b) => b.v - a.v);
  if (!data.length) return <p className="text-sm" style={{ color: T.apagado }}>Aún no hay ventas por categoría.</p>;
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <Cuadro>
        <div className="font-semibold" style={{ color: T.tinta }}>{d.categoria}</div>
        <div style={{ color: d.v < 0 ? T.rojo : T.bueno }}>Margen {d.v >= 0 ? "+" : "−"}{Math.abs(Math.round(d.v))}% ({mxn(d.margen)})</div>
        <div style={{ color: T.tinta2 }}>Vendidas {d.vendidas} de {d.piezas} · {Math.round(d.rotacion * 100)}%</div>
      </Cuadro>
    );
  };
  return (
    <div style={{ height: data.length * 38 + 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 0, bottom: 4 }} barCategoryGap={6}>
          <XAxis type="number" hide domain={[Math.min(0, ...data.map((d) => d.v)) < 0 ? Math.min(...data.map((d) => d.v)) - Math.max(...data.map((d) => d.v), 1) * 0.3 : 0, "dataMax"]} />
          <YAxis type="category" dataKey="categoria" width={92} tickLine={false} axisLine={false} tick={{ fill: T.tinta2, fontSize: 12.5 }} interval={0} />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(244,243,241,0.05)" }} />
          <ReferenceLine x={0} stroke={T.base} />
          <Bar dataKey="v" radius={[0, 3, 3, 0]} maxBarSize={22}>
            {data.map((d) => <Cell key={d.categoria} fill={d.v < 0 ? T.rojo : T.aqua} />)}
            <LabelList dataKey="v" content={(p) => {
              const v = Number(p.value);
              return <text x={v < 0 ? p.x - 6 : p.x + p.width + 6} y={p.y + p.height / 2} dy="0.35em" textAnchor={v < 0 ? "end" : "start"} fill={v < 0 ? T.rojo : T.tinta2} fontSize={12}>{`${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v))}%`}</text>;
            }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Dinero en bodega según los días que lleva ahí
export function Antiguedad({ buckets }) {
  const total = buckets.reduce((t, b) => t + b.costo, 0);
  if (!total) return <p className="text-sm" style={{ color: T.apagado }}>No hay inventario en bodega.</p>;
  const colores = [T.aqua, T.azul, T.naranja, T.rojo];
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return <Cuadro><div className="font-semibold" style={{ color: T.tinta }}>{d.nombre}</div><div style={{ color: T.tinta2 }}>{mxn(d.costo)} a costo · {Math.round((d.costo / total) * 100)}%</div></Cuadro>;
  };
  return (
    <div style={{ height: buckets.length * 44 + 16 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} layout="vertical" margin={{ top: 4, right: 70, left: 0, bottom: 4 }} barCategoryGap={8}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="nombre" width={108} tickLine={false} axisLine={false} tick={{ fill: T.tinta2, fontSize: 12.5 }} interval={0} />
          <Tooltip content={<Tip />} cursor={{ fill: "rgba(244,243,241,0.05)" }} />
          <Bar dataKey="costo" radius={[0, 3, 3, 0]} maxBarSize={24}>
            {buckets.map((b, i) => <Cell key={b.nombre} fill={colores[i]} />)}
            <LabelList dataKey="costo" position="right" fill={T.tinta2} fontSize={12} formatter={(v) => compacto(v)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
