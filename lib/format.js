export const mxn = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n || 0));
export const pct = (n) => `${(Number(n || 0) * 100).toFixed(1)}%`;
