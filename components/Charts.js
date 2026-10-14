"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

const tip = { contentStyle: { background: "#1a1f26", border: "1px solid #333", borderRadius: 8 }, labelStyle: { color: "#ece9e1" } };

function Caja({ titulo, children }) {
  return (
    <div className="card">
      <h3 className="mb-2 text-sm text-white/60">{titulo}</h3>
      <div className="h-56">{children}</div>
    </div>
  );
}

function Barras({ data, x, y, horizontal }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 30 : 0 }}>
        <CartesianGrid stroke="#ffffff10" />
        {horizontal ? (
          <>
            <XAxis type="number" stroke="#888" fontSize={11} />
            <YAxis type="category" dataKey={x} stroke="#888" fontSize={11} width={90} />
          </>
        ) : (
          <>
            <XAxis dataKey={x} stroke="#888" fontSize={11} />
            <YAxis stroke="#888" fontSize={11} />
          </>
        )}
        <Tooltip {...tip} formatter={(v) => Math.round(v).toLocaleString("es-MX")} />
        <Bar dataKey={y}>
          {data.map((d, i) => <Cell key={i} fill={d[y] < 0 ? "#d9534f" : "#c9a24b"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Charts({ lotes, canales, meses, categorias }) {
  return (
    <div className="space-y-4">
      <Caja titulo="Ganancia por lote (MXN)"><Barras data={lotes} x="nombre" y="ganancia" horizontal /></Caja>
      <Caja titulo="Ventas por canal (MXN)"><Barras data={canales} x="canal" y="monto" /></Caja>
      <Caja titulo="Ventas por mes (MXN)"><Barras data={meses} x="mes" y="monto" /></Caja>
      <Caja titulo="Inventario por categoría (costo MXN)"><Barras data={categorias} x="categoria" y="costo" /></Caja>
    </div>
  );
}
