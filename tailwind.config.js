/** @type {import('tailwindcss').Config} */
// Tema oscuro estilo Power BI. "white" es la tinta (texto y bordes tenues) y sale de una variable CSS.
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        white: "rgb(var(--ink) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        // acento azul (antes amarillo)
        amber: { 200: "#B3D7F7", 300: "#6DB3F2", 400: "#4BA3EE", 500: "#2B88D8" },
        emerald: { 300: "#6FD3A0", 400: "#4CC38A", 500: "#2EA66B" },
        red: { 300: "#FF8F8C", 400: "#F2726F", 500: "#E5484D", 600: "#C93C41" },
        sky: { 300: "#8CC8F7" },
      },
      borderRadius: { lg: "0.25rem", xl: "0.375rem", "2xl": "0.5rem" },
      fontFamily: { sans: ['"Segoe UI"', "system-ui", "-apple-system", "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
