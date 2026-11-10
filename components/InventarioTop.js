"use client";
import { useState } from "react";
import { mxn, compacto } from "@/lib/format";
import { T } from "@/components/Resumen";

const num = (x) => Number(x || 0);
// Antigüedad: una sola tinta naranja que se oscurece con los días; lo reciente va en azul.
const colorDias = (d) => (d <= 30 ? { c: T.azul, o: 1 } : d <= 60 ? { c: T.naranja, o: 0.45 } : d <= 90 ? { c: T.naranja, o: 0.72 } : { c: T.naranja, o: 1 });

export default function InventarioTop({ productos = [] }) {
  const [vista, setVista] = useState("cantidad");
  const [todos, setTodos] = useState(false);
  if (!productos.length) return null;

  const filas = productos.map((p) => ({ id: p.id_producto, nombre: p.nombre, piezas: num(p.inventario), costo: num(p.costo_inventario), dias: num(p.dias_en_inventario) }));
  const orden = [...filas].sort((a, b) => (vista === "cantidad" ? b.piezas - a.piezas || b.costo - a.costo : b.dias - a.dias || b.costo - a.costo));
  const lista = todos ? orden.slice(0, 25) : orden.slice(0, 8);
  const max = Math.max(...orden.map((f) => (vista === "cantidad" ? f.piezas : f.dias)), 1);
  const totalPzas = filas.reduce((t, f) => t + f.piezas, 0);

  return (
    <section className="rounded-xl border border-white/10 p-4" style={{ background: T.superficie }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: T.tinta }}>Lo que más tenemos en inventario</h3>
          <p className="mt-0.5 text-xs" style={{ color: T.apagado }}>{totalPzas.toLocaleString("es-MX")} piezas en {filas.length} productos</p>
        </div>
        <div className="flex shrink-0 gap-1 rounded-lg border border-white/10 p-0.5 text-xs">
          {[["cantidad", "Cantidad"], ["tiempo", "Tiempo"]].map(([v, l]) => (
            <button key={v} onClick={() => setVista(v)} className="rounded-md px-2.5 py-1"
              style={vista === v ? { background: "rgba(255,255,255,0.12)", color: T.tinta } : { color: T.apagado }}>{l}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-0.5">
        {lista.map((f) => {
          const val = vista === "cantidad" ? f.piezas : f.dias;
          const col = vista === "cantidad" ? { c: T.azul, o: 1 } : colorDias(f.dias);
          return (
            <div key={f.id} className="rounded-md px-2 py-1.5 hover:bg-white/5" title={`${f.nombre}: ${f.piezas} pzas · ${f.dias} días · ${mxn(f.costo)} a costo`}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate" style={{ color: T.tinta2 }}>{f.nombre}</span>
                <span className="shrink-0 font-medium tabular-nums" style={{ color: T.tinta }}>
                  {vista === "cantidad" ? `${f.piezas} pzas` : `${f.dias} días`}
                  <span className="ml-1.5 text-[11px] font-normal" style={{ color: T.apagado }}>{vista === "cantidad" ? compacto(f.costo) : `×${f.piezas}`}</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5">
                <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: T.rejilla }} />
                <div className="absolute h-full" style={{ left: 0, width: `${Math.max((val / max) * 100, 1.5)}%`, background: col.c, opacity: col.o, borderRadius: "0 4px 4px 0" }} />
              </div>
            </div>
          );
        })}
      </div>

      {vista === "tiempo" && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]" style={{ color: T.apagado }}>
          {[["hasta 30 días", colorDias(1)], ["30–60", colorDias(45)], ["60–90", colorDias(75)], ["más de 90", colorDias(120)]].map(([l, c]) => (
            <span key={l} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full" style={{ background: c.c, opacity: c.o }} />{l}</span>
          ))}
        </div>
      )}
      {orden.length > 8 && (
        <button className="mt-2 text-xs" style={{ color: T.tinta2 }} onClick={() => setTodos((t) => !t)}>
          {todos ? "Ver menos" : `Ver más (${Math.min(orden.length, 25)})`}
        </button>
      )}
    </section>
  );
}
