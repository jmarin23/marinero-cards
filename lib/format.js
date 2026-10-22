export const mxn = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n || 0));
export const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;

// $1.2M · $153K · $820 (para tarjetas y ejes)
export const compacto = (n) => {
  const v = Number(n || 0), a = Math.abs(v), s = v < 0 ? "−" : "";
  const t = (x, d) => x.toFixed(d).replace(/\.0$/, "");
  if (a >= 1e6) return `${s}$${t(a / 1e6, a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${s}$${t(a / 1e3, a >= 1e5 ? 0 : 1)}K`;
  return `${s}$${Math.round(a)}`;
};
