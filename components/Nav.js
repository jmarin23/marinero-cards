"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Ico = ({ d }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.split("|").map((x, i) => <path key={i} d={x} />)}
  </svg>
);

const items = [
  { href: "/", label: "Tablero", grupo: "Reportes", match: (p) => p === "/", d: "M3 3h7v9H3z|M14 3h7v5h-7z|M14 12h7v9h-7z|M3 16h7v5H3z" },
  { href: "/inventario", label: "Inventario", grupo: "Reportes", match: (p) => p.startsWith("/inventario"), d: "M3 7l9-4 9 4v10l-9 4-9-4z|M3 7l9 4 9-4|M12 11v10" },
  { href: "/analisis", label: "Análisis", grupo: "Reportes", match: (p) => p.startsWith("/analisis"), d: "M4 20V10|M10 20V4|M16 20v-7|M22 20H2" },
  { href: "/socios", label: "Socios", grupo: "Reportes", match: (p) => p.startsWith("/socios") || p.startsWith("/pagarme"), d: "M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1|M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7|M21 20v-1a4 4 0 00-3-3.9|M16 4.1a3.5 3.5 0 010 6.8" },
  { href: "/coleccion", label: "Colección", grupo: "Reportes", match: (p) => p.startsWith("/coleccion"), d: "M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z|M9 8h6|M9 12h6|M9 16h3" },
  { href: "/ventas/nueva", label: "Venta", grupo: "Captura", match: (p) => p.startsWith("/ventas") || p.startsWith("/libreta"), d: "M12 3v18|M16.5 7.5C16.5 5.8 14.5 4.5 12 4.5S7.5 5.8 7.5 7.5 9.5 10.2 12 10.5s4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" },
  { href: "/compras/nueva", label: "Compra", grupo: "Captura", match: (p) => p.startsWith("/compras"), d: "M3 4h2l2.5 11h10L20 8H6.5|M9 20.5h.01|M17 20.5h.01" },
  { href: "/datos", label: "Datos", grupo: "Administración", match: (p) => p.startsWith("/datos") || p.startsWith("/tiktok") || p.startsWith("/revisar"), d: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z|M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6|M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" },
];
const grupos = ["Reportes", "Captura", "Administración"];

const Marca = () => (
  <span className="flex items-center gap-2">
    <span className="grid h-6 w-6 place-items-center rounded-[3px] bg-amber-500 text-[0.6875rem] font-bold text-[#ffffff]">M</span>
    <span className="text-sm font-semibold tracking-tight">Marinero Cards</span>
  </span>
);

// Armazón: menú lateral (escritorio), barra superior y menú inferior (celular)
export default function Shell({ children }) {
  const path = usePathname() || "/";
  if (path === "/login") return <main className="mx-auto max-w-3xl px-4 pt-6">{children}</main>;
  const activo = items.find((i) => i.match(path));
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-white/10 bg-surface md:flex">
        <div className="flex h-12 items-center border-b border-white/10 px-4"><Marca /></div>
        <nav className="flex-1 space-y-4 overflow-y-auto py-4">
          {grupos.map((g) => (
            <div key={g}>
              <div className="px-4 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-white/35">{g}</div>
              {items.filter((i) => i.grupo === g).map((i) => {
                const on = i.match(path);
                return (
                  <Link key={i.href} href={i.href}
                    className={`flex items-center gap-3 border-l-2 px-4 py-2 text-sm transition-colors ${on ? "border-amber-500 bg-amber-500/10 font-semibold text-white" : "border-transparent text-white/60 hover:bg-white/5 hover:text-white"}`}>
                    <Ico d={i.d} />{i.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3 text-[0.6875rem] text-white/30">Control de negocio</div>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-white/10 bg-[#0e0f11]/90 px-4 backdrop-blur md:px-6">
          <span className="md:hidden"><Marca /></span>
          <span className="hidden text-sm text-white/40 md:inline">Marinero Cards</span>
          {activo && <span className="hidden text-sm text-white/40 md:inline">/</span>}
          {activo && <span className="hidden text-sm font-medium md:inline">{activo.label}</span>}
        </header>
        <main className={`mx-auto px-4 pb-24 pt-5 md:px-6 md:pb-10 ${path === "/" ? "max-w-6xl" : "max-w-4xl"}`}>{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl">
          {items.map((i) => {
            const on = i.match(path);
            return (
              <Link key={i.href} href={i.href}
                className={`flex flex-1 flex-col items-center gap-0.5 border-t-2 pb-2 pt-2 text-[0.625rem] ${on ? "border-amber-500 text-amber-400" : "border-transparent text-white/55"}`}>
                <Ico d={i.d} />{i.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
