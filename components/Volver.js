"use client";
import { useRouter } from "next/navigation";

// Regresa a la pantalla donde estabas (con su lote, filtros, etc.). Si no hay historial, va a la ruta de respaldo.
export default function Volver({ a = "/", texto = "Volver", className = "" }) {
  const router = useRouter();
  const ir = () => {
    try {
      if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) return router.back();
    } catch {}
    router.push(a);
  };
  return <button onClick={ir} className={`text-sm text-amber-300 ${className}`}>← {texto}</button>;
}
