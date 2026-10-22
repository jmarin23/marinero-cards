"use client";
import { useEffect, useState } from "react";
import TablaEditable from "@/components/TablaEditable";
import ResumenLotes from "@/components/ResumenLotes";

const leer = () => { try { return localStorage.getItem("vistaInventario") || "productos"; } catch { return "productos"; } };
const guardar = (v) => { try { localStorage.setItem("vistaInventario", v); } catch {} };

export default function Inventario() {
  const [vista, setVista] = useState("productos");
  const [lote, setLote] = useState("");
  useEffect(() => { setVista(leer()); }, []);
  const cambiar = (v) => { setVista(v); guardar(v); if (v === "lotes") setLote(""); };
  const chip = (act) => `flex-1 rounded-lg border py-2 text-sm ${act ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={chip(vista === "productos")} onClick={() => cambiar("productos")}>Productos</button>
        <button className={chip(vista === "lotes")} onClick={() => cambiar("lotes")}>Por lote</button>
      </div>
      {vista === "lotes"
        ? <><h1 className="text-2xl font-semibold">Inventario por lote</h1><ResumenLotes onVerLote={(id) => { setLote(id); setVista("productos"); }} /></>
        : <>
            {lote && (
              <div className="space-y-3">
                <button className="text-sm text-amber-300" onClick={() => setLote("")}>Viendo solo este lote · quitar filtro</button>
                <ResumenLotes soloLote={lote} onVerLote={() => {}} onBorrado={() => setLote("")} />
              </div>
            )}
            <TablaEditable key={lote || "todos"} tabla="inventario" chipsIniciales={lote ? { id_lote: lote } : {}} />
          </>}
    </div>
  );
}
