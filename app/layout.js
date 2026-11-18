import "./globals.css";
import Nav from "@/components/Nav";
import NumerosLimpios from "@/components/NumerosLimpios";

export const metadata = { title: "Marinero Cards", description: "Control de negocio de cartas" };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen pb-24">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2.5">
            <span className="h-4 w-1 rounded-sm bg-amber-500" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">Marinero Cards</span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 pt-5">{children}</main>
        <Nav />
        <NumerosLimpios />
      </body>
    </html>
  );
}
