// Lógica de importación de reportes de TikTok Shop (sin dependencias de UI).

const norm = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Campos que intentamos encontrar, con palabras clave (ya sin acentos). El orden importa: primero la más específica.
export const CAMPOS = [
  { k: "id", l: "ID del pedido", req: true, claves: ["order/adjustment id", "order id", "id del pedido", "id de pedido", "id pedido", "numero de pedido", "pedido"] },
  { k: "monto", l: "Monto liquidado (neto)", req: true, claves: ["importe total de la liquidacion", "total settlement amount", "settlement amount", "monto liquidado", "liquidado", "liquidacion", "settlement", "neto"] },
  { k: "fecha", l: "Fecha", claves: ["fecha de creacion", "order created time", "created time", "fecha del pedido", "fecha"] },
  { k: "producto", l: "Producto", claves: ["nombre del producto", "product name", "producto", "product", "sku"] },
  { k: "cantidad", l: "Cantidad", claves: ["cantidad", "quantity", "cant"] },
  { k: "estado", l: "Estado", claves: ["estado", "status", "fecha de liquidacion", "order settled time", "settled time"] },
];

export function detectarEncabezado(filas) {
  const todas = CAMPOS.flatMap((c) => c.claves);
  let mejor = 0, mejorN = -1;
  filas.slice(0, 15).forEach((f, i) => {
    const n = f.filter((c) => typeof c === "string" && todas.some((k) => norm(c).includes(k))).length;
    if (n > mejorN) { mejorN = n; mejor = i; }
  });
  return mejor;
}

export function adivinarColumnas(encabezados) {
  const hs = encabezados.map(norm);
  const usado = new Set();
  const map = {};
  for (const c of CAMPOS) {
    let idx = -1;
    for (const clave of c.claves) {
      idx = hs.findIndex((h, i) => !usado.has(i) && h && (h === clave || h.includes(clave)));
      if (idx >= 0) break;
    }
    if (idx >= 0) usado.add(idx);
    map[c.k] = idx;
  }
  return map;
}

export function aNumero(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");           // 1,087.38
  else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, ""); // 1087,38 ó 1,087
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

export function aFecha(v) {
  if (!v) return null;
  if (typeof v === "number" && v > 20000 && v < 80000) // serie de Excel (sin zonas horarias)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10);
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/); // DD/MM/YYYY (México)
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function aId(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("fullwide", { useGrouping: false }) : String(v);
  return String(v).replace(/[\s\t'"]/g, "");
}

export function estadoDe(v, modo) {
  if (modo === "Pagado" || modo === "En espera") return modo;
  const s = norm(v);
  if (!s) return "Pagado";
  if (/refund|reembols|cancel|devol/.test(s)) return "Reembolso";
  if (/paid|pagad|settled|liquidad|complet|deliver|entregad|\d{4}/.test(s)) return "Pagado"; // incluye fechas de liquidación
  return "En espera";
}

const tokens = (s) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((t) => t.length > 2));
export function similitud(a, b) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / Math.max(A.size, B.size);
}

// filas: [{id, fecha, producto, cantidad, monto, estado}]  ventas: filas de la tabla ventas (+ nombre de producto)
export function empatar(filas, ventas) {
  const usadas = new Set();
  const resultado = filas.map((f, i) => ({ f, i, accion: null, venta: null, score: 0, candidatos: [] }));

  // 1) Empate exacto por id_pedido_tiktok
  const porPedido = new Map();
  ventas.forEach((v) => { if (v.id_pedido_tiktok) (porPedido.get(v.id_pedido_tiktok) || porPedido.set(v.id_pedido_tiktok, []).get(v.id_pedido_tiktok)).push(v); });
  resultado.forEach((r) => {
    const lista = (porPedido.get(r.f.id) || []).filter((v) => !usadas.has(v.id_venta));
    if (!lista.length) return;
    lista.sort((a, b) => Math.abs(a.monto_neto - (r.f.monto ?? 0)) - Math.abs(b.monto_neto - (r.f.monto ?? 0)));
    r.venta = lista[0]; r.accion = "actualizar"; r.score = 10; usadas.add(lista[0].id_venta);
  });

  // 2) Sugerencia por monto (+ nombre si hay) entre ventas TikTok sin id
  const libres = ventas.filter((v) => !v.id_pedido_tiktok && (v.canal === "TikTok" || !v.canal) && v.estado !== "Reembolso");
  const pares = [];
  resultado.filter((r) => !r.accion).forEach((r) => {
    libres.forEach((v) => {
      if (r.f.monto == null) return;
      const dif = Math.abs(v.monto_neto - r.f.monto);
      const rel = v.monto_neto > 0 ? dif / v.monto_neto : 1;
      const am = dif <= 1.5 ? 3 : rel <= 0.05 ? 2 : rel <= 0.15 ? 1 : 0;
      if (!am) return;
      const sim = r.f.producto ? similitud(r.f.producto, v.producto_nombre || "") : 0;
      const pendiente = v.estado !== "Pagado" && v.estado !== "Cobrado" ? 0.5 : 0;
      pares.push({ r, v, score: am + sim * 2 + pendiente });
    });
  });
  pares.sort((a, b) => b.score - a.score);
  pares.forEach((p) => { (p.r.candidatos ||= []).push(p); });
  pares.forEach((p) => {
    if (p.r.accion || usadas.has(p.v.id_venta)) return;
    p.r.venta = p.v; p.r.accion = "empatar"; p.r.score = p.score; usadas.add(p.v.id_venta);
  });

  // 3) Lo que sobra: crear nueva venta (se revisa después)
  resultado.forEach((r) => { if (!r.accion) r.accion = "crear"; });
  return resultado;
}
