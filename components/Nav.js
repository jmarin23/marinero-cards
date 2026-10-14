"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Tablero" },
  { href: "/ventas/nueva", label: "Venta" },
  { href: "/compras/nueva", label: "Compra" },
  { href: "/socios", label: "Socios" },
  { href: "/datos", label: "Datos" },
];

export default function Nav() {
  const path = usePathname();
  if (path === "/login") return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-[#0f1216]/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {items.map((i) => (
          <Link key={i.href} href={i.href}
            className={`flex-1 py-4 text-center text-sm ${(i.href === "/" ? path === "/" : path.startsWith(i.href)) ? "text-amber-400 font-semibold" : "text-white/60"}`}>
            {i.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
