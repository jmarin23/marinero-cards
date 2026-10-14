import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = { title: "Marinero Cards", description: "Control de negocio de cartas" };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen pb-24">
        <main className="mx-auto max-w-3xl px-4 pt-6">{children}</main>
        <Nav />
      </body>
    </html>
  );
}
