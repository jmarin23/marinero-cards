"use client";
import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LabelList } from "recharts";
import { mxn, compacto } from "@/lib/format";
import { T } from "@/components/Resumen";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaMes = (m, conAnio) => {
  const [a, mm] = String(m).split("-");
  return `${MES[Number(mm) - 1] || m}${conAnio ? ` ${String(a).slice(2)}` : ""}`;
};

function Tarjeta({ titulo, sub, children, derecha }) {
  return (
    <section className="rounded-xl border border-white/10 p-4" style={{ background: T.superficie }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: T.tinta }}>{titulo}</h3>
          {sub && <p className="mt-0.5 text-xs" style={{ color: T.apagado }}>{sub}</p>}
        </div>
        {derecha}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const Llave = ({ color, texto }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: T.tinta2 }}>
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />{texto}
  </span>
);

// ---------- Ventas por mes: columnas finas, el mes en curso resaltado ----------
function TooltipMes({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: "#14181d", borderColor: "rgba(255,255,255,0.12)" }}>
      <div className="text-base font-semibold" style={{ color: T.tinta }}>{mxn(d.monto)}</div>
      <div style={{ color: T.tinta2 }}>{d.nombre}</div>
    </div>
  );
}

function VentasMes({ meses }) {
  if (!meses.length) return <p className="text-sm" style={{ color: T.apagado }}>Aún no hay ventas con fecha.</p>;
  const anios = new Set(meses.map((m) => String(m.mes).slice(0, 4)));
  const data = meses.map((m) => ({ ...m, nombre: etiquetaMes(m.mes, anios.size > 1), monto: Number(m.monto) }));
  const ultimo = data.length - 1;
  return (
    <>
      <div style={{ height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 22, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={T.rejilla} />
            <XAxis dataKey="nombre" tickLine={false} axisLine={{ stroke: T.base }} tick={{ fill: T.apagado, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: T.apagado, fontSize: 11 }} tickFormatter={(v) => (v === 0 ? "0" : compacto(v).replace("$", ""))} width={40} />
            <Tooltip content={<TooltipMes />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
            <Bar dataKey="monto" barSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d, i) => <Cell key={d.mes} fill={i === ultimo ? T.azul : T.azulSuave} />)}
              <LabelList dataKey="monto" position="top" content={({ x, y, width, value, index }) => (index === ultimo
                ? <text x={x + width / 2} y={y - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={T.tinta}>{compacto(value)}</text> : null)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs" style={{ color: T.apagado }}>
        <summary className="cursor-pointer">Ver tabla</summary>
        <div className="mt-2 space-y-1">
          {data.map((d) => (
            <div key={d.mes} className="flex justify-between"><span>{d.nombre}</span><span className="tabular-nums" style={{ color: T.tinta2 }}>{mxn(d.monto)}</span></div>
          ))}
        </div>
      </details>
    </>
  );
}

// ---------- Fila de barra horizontal en HTML: nombre arriba, barra fina, valor al extremo ----------
function Fila({ nombre, valor, texto, extra, color, ini, fin, cero }) {
  // ini/fin: % del ancho donde empieza y termina la barra; cero: % de la línea base
  const negativa = valor < 0;
  return (
    <div className="group rounded-md px-2 py-1.5 transition-colors hover:bg-white/5" title={`${nombre}: ${texto}${extra ? ` · ${extra}` : ""}`}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate" style={{ color: T.tinta2 }}>{nombre}</span>
        <span className="shrink-0 font-medium tabular-nums" style={{ color: T.tinta }}>
          {texto}{extra && <span className="ml-1.5 text-[11px] font-normal" style={{ color: negativa ? T.rojo : T.apagado }}>{extra}</span>}
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5">
        <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: T.rejilla }} />
        <div className="absolute h-full"
          style={{
            left: `${ini}%`, width: `${Math.max(fin - ini, 0.8)}%`, background: color,
            borderRadius: cero == null ? "0 4px 4px 0" : negativa ? "4px 0 0 4px" : "0 4px 4px 0",
          }} />
        {cero != null && <div className="absolute top-[-2px] h-[14px] w-px" style={{ left: `${cero}%`, background: T.base }} />}
      </div>
    </div>
  );
}

function GananciaLote({ lotes }) {
  const [todos, setTodos] = useState(false);
  if (!lotes.length) return <p className="text-sm" style={{ color: T.apagado }}>Aún no hay lotes con costo.</p>;
  const orden = [...lotes].sort((a, b) => b.ganancia - a.ganancia);
  // por defecto: los mejores y, si hay, los peores (las pérdidas no se esconden)
  const vista = todos || orden.length <= 8 ? orden : [...orden.slice(0, 5), ...orden.slice(-3)];
  const pos = Math.max(0, ...orden.map((l) => l.ganancia)), neg = Math.max(0, ...orden.map((l) => -l.ganancia));
  const total = pos + neg || 1, cero = (neg / total) * 100;
  return (
    <>
      <div className="space-y-0.5">
        {vista.map((l) => {
          const w = (Math.abs(l.ganancia) / total) * 100;
          const roi = l.costo > 0 ? l.ganancia / l.costo : null;
          return (
            <Fila key={l.nombre + l.ganancia} nombre={l.nombre} valor={l.ganancia} texto={mxn(l.ganancia)}
              extra={roi != null ? `${roi >= 0 ? "+" : "−"}${Math.abs(Math.round(roi * 100))}%` : null}
              color={l.ganancia < 0 ? T.rojo : T.azul}
              ini={l.ganancia < 0 ? cero - w : cero} fin={l.ganancia < 0 ? cero : cero + w} cero={neg > 0 ? cero : null} />
          );
        })}
      </div>
      {orden.length > 8 && (
        <button className="mt-2 text-xs" style={{ color: T.tinta2 }} onClick={() => setTodos((t) => !t)}>
          {todos ? "Ver menos" : `Ver los ${orden.length} lotes`}
        </button>
      )}
    </>
  );
}

// ---------- Ranking secuencial (una sola tinta, de mayor a menor) ----------
function Ranking({ filas, fmt = mxn }) {
  if (!filas.length) return <p className="text-sm" style={{ color: T.apagado }}>Sin datos todavía.</p>;
  const orden = [...filas].sort((a, b) => b.valor - a.valor);
  const max = Math.max(...orden.map((f) => f.valor)) || 1;
  const suma = orden.reduce((t, f) => t + f.valor, 0) || 1;
  return (
    <div className="space-y-0.5">
      {orden.map((f) => (
        <Fila key={f.nombre} nombre={f.nombre} valor={f.valor} texto={fmt(f.valor)} extra={`${Math.round((f.valor / suma) * 100)}%`}
          color={T.azul} ini={0} fin={(f.valor / max) * 100} cero={null} />
      ))}
    </div>
  );
}

// ---------- Canales: una barra 100% apilada con huecos de 2px + leyenda con cifras ----------
const COLOR_CANAL = { TikTok: T.azul, Externa: T.naranja, "Mercado Libre": T.aqua };
function Canales({ canales }) {
  const filas = canales.filter((c) => c.monto > 0).sort((a, b) => b.monto - a.monto);
  if (!filas.length) return <p className="text-sm" style={{ color: T.apagado }}>Sin ventas todavía.</p>;
  const suma = filas.reduce((t, c) => t + c.monto, 0) || 1;
  const color = (c) => COLOR_CANAL[c] || "#6b7078";
  return (
    <>
      <div className="flex h-3 w-full gap-[2px]" role="img" aria-label="Reparto de ventas por canal">
        {filas.map((c, i) => (
          <div key={c.canal} title={`${c.canal}: ${mxn(c.monto)}`}
            style={{ width: `${(c.monto / suma) * 100}%`, background: color(c.canal), borderRadius: i === 0 ? "4px 0 0 4px" : i === filas.length - 1 ? "0 4px 4px 0" : 0 }} />
        ))}
      </div>
      <div className="mt-3 space-y-0.5">
        {filas.map((c) => (
          <div key={c.canal} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] hover:bg-white/5">
            <Llave color={color(c.canal)} texto={c.canal} />
            <span className="tabular-nums" style={{ color: T.tinta }}>
              {mxn(c.monto)} <span className="ml-1.5 text-[11px]" style={{ color: T.apagado }}>{Math.round((c.monto / suma) * 100)}%</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export default function Charts({ lotes, canales, meses, categorias }) {
  const mejor = lotes.length ? [...lotes].sort((a, b) => b.ganancia - a.ganancia)[0] : null;
  const hayPerdida = lotes.some((l) => l.ganancia < 0);
  return (
    <div className="space-y-3">
      <Tarjeta titulo="Ventas por mes" sub="Mes en curso resaltado"><VentasMes meses={meses} /></Tarjeta>
      <Tarjeta titulo="Ganancia por lote" sub={mejor ? `Mejor: ${mejor.nombre} · ${compacto(mejor.ganancia)}` : null}
        derecha={hayPerdida ? <div className="flex shrink-0 flex-col items-end gap-1"><Llave color={T.azul} texto="Ganancia" /><Llave color={T.rojo} texto="Pérdida" /></div> : null}>
        <GananciaLote lotes={lotes} />
      </Tarjeta>
      <Tarjeta titulo="Ventas por canal" sub="Reparto del total vendido"><Canales canales={canales} /></Tarjeta>
      <Tarjeta titulo="Inventario por categoría" sub="Costo de lo que sigue en bodega">
        <Ranking filas={categorias.map((c) => ({ nombre: c.categoria, valor: c.costo }))} />
      </Tarjeta>
    </div>
  );
}
