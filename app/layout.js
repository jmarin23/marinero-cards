import "./globals.css";
import Shell from "@/components/Nav";
import NumerosLimpios from "@/components/NumerosLimpios";

export const metadata = { title: "Marinero Cards", description: "Control de negocio de cartas" };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <Shell>{children}</Shell>
        <NumerosLimpios />
      </body>
    </html>
  );
}
