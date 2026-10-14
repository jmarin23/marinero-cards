import Link from "next/link";
import { TABLAS } from "@/lib/tablas";

export default function Datos() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Datos</h1>
      <p className="text-sm text-white/50">Aquí puedes ver y editar todo: nombres, montos, fechas, estados. También agregar y borrar.</p>
      <div className="space-y-2">
        <Link href="/tiktok/importar" className="card block border-amber-500/40 text-amber-300 active:bg-white/10">Importar TikTok (subir reporte de pedidos) →</Link>
        <Link href="/revisar" className="card block active:bg-white/10">Revisar ventas (sin empatar / sin producto) →</Link>
        {Object.entries(TABLAS).filter(([k]) => k !== "inventario").map(([k, c]) => (
          <Link key={k} href={`/datos/${k}`} className="card block active:bg-white/10">{c.titulo}</Link>
        ))}
      </div>
    </div>
  );
}
