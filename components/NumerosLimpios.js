"use client";
import { useEffect } from "react";

// Los campos numéricos solo se escriben: ni la rueda/trackpad ni las flechas del teclado cambian el valor.
export default function NumerosLimpios() {
  useEffect(() => {
    const esNum = (el) => el && el.tagName === "INPUT" && el.type === "number";
    const rueda = () => { const a = document.activeElement; if (esNum(a)) a.blur(); };
    const flechas = (e) => { if (esNum(e.target) && (e.key === "ArrowUp" || e.key === "ArrowDown")) e.preventDefault(); };
    document.addEventListener("wheel", rueda, { passive: true });
    document.addEventListener("keydown", flechas, true);
    return () => { document.removeEventListener("wheel", rueda); document.removeEventListener("keydown", flechas, true); };
  }, []);
  return null;
}
