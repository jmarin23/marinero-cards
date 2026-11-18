import { T } from "@/components/Resumen";

// Visual de reporte: encabezado con título, línea divisoria y cuerpo (estilo Power BI)
export default function Panel({ titulo, sub, derecha, children, className = "" }) {
  return (
    <section className={`rounded-md border border-white/10 ${className}`} style={{ background: T.superficie }}>
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0">
          <h3 className="text-[0.8125rem] font-semibold" style={{ color: T.tinta }}>{titulo}</h3>
          {sub && <p className="text-[0.6875rem]" style={{ color: T.apagado }}>{sub}</p>}
        </div>
        {derecha}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
