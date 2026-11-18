/** @type {import('tailwindcss').Config} */
// Tema claro estilo Power BI / Fluent. "white" pasa a ser la tinta (texto y bordes tenues) para no reescribir cada pantalla.
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
        amber: { 200: "#0B4F8A", 300: "#0F6CBD", 400: "#0F6CBD", 500: "#0F6CBD" },
        emerald: { 300: "#107C10", 400: "#107C10", 500: "#107C10" },
        red: { 300: "#C50F1F", 400: "#C50F1F", 500: "#C50F1F", 600: "#B10E1C" },
        sky: { 300: "#0B5A9E" },
      },
      borderRadius: { lg: "0.25rem", xl: "0.375rem", "2xl": "0.5rem" },
      fontFamily: { sans: ['"Segoe UI"', "system-ui", "-apple-system", "Roboto", '"Helvetica Neue"', "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
