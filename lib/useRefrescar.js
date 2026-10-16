import { useEffect, useRef } from "react";

// Vuelve a cargar los datos cuando regresas a la pestaña o a la ventana (por si capturaste algo en otro lado).
export function useRefrescar(fn) {
  const ult = useRef(fn);
  ult.current = fn;
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") ult.current(); };
    document.addEventListener("visibilitychange", f);
    window.addEventListener("focus", f);
    return () => { document.removeEventListener("visibilitychange", f); window.removeEventListener("focus", f); };
  }, []);
}
