"use client";
import { useEffect, useState } from "react";
import TablaEditable from "@/components/TablaEditable";
import ResumenLotes from "@/components/ResumenLotes";

const leer = () => { try { return localStorage.getItem("vistaInventario") || "productos"; } catch { return "productos"; } };
const guardar = (v) => { try { localStorage.setItem("vistaInventario", v); } catch {} };
const deURL = () => { const p = new URLSearchParams(window.location.search); return { vista: p.get("vista"), lote: p.get("lote") || "" }; };

export default function Inventario() {
  const [vista, setVista] = useState("productos");
  const [lote, setLote] = useState("");
  const [tick, setTick] = useState(0); // para recargar la tabla de abajo cuando se ajustan costos

  // La vista y el lote viven en la URL: "atrás" del navegador regresa de lote a lotes, y de ahí a donde venías
  useEffect(() => {
    const aplicar = () => { const u = deURL(); setLote(u.lote); setVista(u.lote ? "productos" : u.vista || leer()); };
    aplicar();
    window.addEventListener("popstate", aplicar);
    return () => window.removeEventListener("popstate", aplicar);
  }, []);
  function ir(v, l = "") {
    setVista(v); setLote(l); guardar(v);
    const q = new URLSearchParams();
    if (l) q.set("lote", l); else q.set("vista", v);
    window.history.pushState(null, "", `?${q}`);
  }
  const chip = (act) => `flex-1 rounded-lg border py-2 text-sm ${act ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={chip(vista === "productos" && !lote)} onClick={() => ir("productos")}>Productos</button>
        <button className={chip(vista === "lotes")} onClick={() => ir("lotes")}>Por lote</button>
      </div>
      {vista === "lotes"
        ? <><h1 className="text-2xl font-semibold">Inventario por lote</h1><ResumenLotes onVerLote={(id) => ir("productos", id)} /></>
        : <>
            {lote && (
              <div className="space-y-3">
                <button className="text-sm text-amber-300" onClick={() => window.history.back()}>← Volver</button>
                <ResumenLotes soloLote={lote} onVerLote={() => {}} onBorrado={() => ir("lotes")} onCambio={() => setTick((t) => t + 1)} />
              </div>
            )}
            <TablaEditable key={`${lote || "todos"}-${tick}`} tabla="inventario" chipsIniciales={lote ? { id_lote: lote } : {}} />
          </>}
    </div>
  );
}
