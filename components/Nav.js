"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Tablero" },
  { href: "/inventario", label: "Inventario" },
  { href: "/ventas/nueva", label: "Venta" },
  { href: "/compras/nueva", label: "Compra" },
  { href: "/socios", label: "Socios" },
  { href: "/coleccion", label: "Colección" },
  { href: "/datos", label: "Datos" },
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-surface/95 shadow-[0_-1px_4px_rgba(0,0,0,0.06)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex-1 py-4 text-center text-xs sm:text-sm ${(i.href === "/" ? path === "/" : path.startsWith(i.href)) ? "border-t-2 border-amber-500 -mt-px font-semibold text-amber-400" : "text-white/60"}`}>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
