"use client";
import { useEffect, useMemo, useRef, useState } from "react";

const norm = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Lista desplegable que se maneja con el teclado: escribe para filtrar, flechas para moverte,
// Enter para elegir, Esc para cerrar. options: [{ v, l }]. Siempre ofrece "— sin valor —" arriba.
export default function Combo({ value, onChange, options, vacio = "— sin valor —", placeholder = "Escribe para buscar…" }) {
  const todas = useMemo(() => [{ v: "", l: vacio }, ...options], [options, vacio]);
  const actual = options.find((o) => String(o.v) === String(value ?? ""));
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [tocado, setTocado] = useState(false); // ya escribió algo: filtrar
  const [i, setI] = useState(0);
  const lista = useRef(null);

  const palabras = norm(tocado ? texto : "").split(/\s+/).filter(Boolean);
  const visibles = todas.filter((o) => !palabras.length || palabras.every((w) => norm(o.l).includes(w)));

  function abrir() {
    setTexto(""); setTocado(false); setAbierto(true);
    const k = todas.findIndex((o) => String(o.v) === String(value ?? ""));
    setI(Math.max(0, k));
  }
  function elegir(o) { onChange(o.v); setAbierto(false); setTocado(false); }
  function cerrar() { setAbierto(false); setTocado(false); }

  useEffect(() => { // mantiene a la vista la opción marcada
    if (!abierto) return;
    lista.current?.querySelector(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
  }, [i, abierto, tocado]);

  function tecla(e) {
    if (!abierto && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); abrir(); return; }
    if (!abierto) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(visibles.length - 1, x + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (visibles[i]) elegir(visibles[i]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); }
    else if (e.key === "Tab") { if (tocado && visibles[i]) elegir(visibles[i]); else cerrar(); }
  }

  return (
    <div className="relative mt-1">
      <input className="input" role="combobox" aria-expanded={abierto} autoComplete="off"
        value={abierto && tocado ? texto : actual?.l ?? ""} placeholder={placeholder}
        onFocus={abrir} onClick={() => !abierto && abrir()} onBlur={cerrar} onKeyDown={tecla}
        onChange={(e) => { setTexto(e.target.value); setTocado(true); setAbierto(true); setI(0); }} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/40">▾</span>
      {abierto && (
        <ul ref={lista} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-white/15 bg-[#1d222a] shadow-xl">
          {visibles.length === 0 && <li className="px-3 py-2 text-sm text-white/50">Sin resultados</li>}
          {visibles.map((o, k) => (
            <li key={o.v || "vacio"} data-i={k} role="option" aria-selected={String(o.v) === String(value ?? "")}
              onMouseDown={(e) => { e.preventDefault(); elegir(o); }} onMouseEnter={() => setI(k)}
              className={`cursor-pointer px-3 py-2 text-sm ${k === i ? "bg-amber-500/20 text-amber-200" : "text-white/80"} ${String(o.v) === String(value ?? "") ? "font-semibold" : ""} ${o.v === "" ? "text-white/40" : ""}`}>
              {o.l}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
