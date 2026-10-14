"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

const tip = {
  contentStyle: { background: "#1f252d", border: "1px solid #c9a24b", borderRadius: 8, color: "#ece9e1" },
  labelStyle: { color: "#f5d98b", fontWeight: 600 },
  itemStyle: { color: "#ece9e1" },
  cursor: { fill: "rgba(255,255,255,0.06)" },
};

function Caja({ titulo, alto = 224, children }) {
  return (
    <div className="card">
      <h3 className="mb-2 text-sm text-white/60">{titulo}</h3>
      <div style={{ height: alto }}>{children}</div>
    </div>
  );
}

function Barras({ data, x, y, horizontal }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="#ffffff10" />
        {horizontal ? (
          <>
            <XAxis type="number" stroke="#888" fontSize={11} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <YAxis type="category" dataKey={x} stroke="#aaa" fontSize={12} width={160} interval={0} tickLine={false} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} stroke="#888" fontSize={11} />
            <YAxis stroke="#888" fontSize={11} />
          </>
        )}
        <Tooltip {...tip} formatter={(v) => Math.round(v).toLocaleString("es-MX")} />
        <Bar dataKey={y} radius={[3, 3, 3, 3]}>
          {data.map((d, i) => <Cell key={i} fill={d[y] < 0 ? "#d9534f" : "#c9a24b"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Charts({ lotes, canales, meses, categorias }) {
  return (
    <div className="space-y-4">
      <Caja titulo="Ganancia por lote (MXN)" alto={Math.max(240, lotes.length * 34 + 30)}><Barras data={lotes} x="nombre" y="ganancia" horizontal /></Caja>
      <Caja titulo="Ventas por canal (MXN)"><Barras data={canales} x="canal" y="monto" /></Caja>
      <Caja titulo="Ventas por mes (MXN)"><Barras data={meses} x="mes" y="monto" /></Caja>
      <Caja titulo="Inventario por categoría (costo MXN)"><Barras data={categorias} x="categoria" y="costo" /></Caja>
    </div>
  );
}
