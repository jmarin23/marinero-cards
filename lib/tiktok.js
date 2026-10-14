// Lógica de importación de reportes de TikTok Shop (sin dependencias de UI).

const norm = (s) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Campos que intentamos encontrar, con palabras clave (ya sin acentos). El orden importa: primero la más específica.
export const CAMPOS = [
  { k: "id", l: "ID del pedido", req: true, claves: ["identificacion del pedido/ajuste", "order/adjustment id", "identificacion del pedido", "order id", "id del pedido", "id de pedido", "id pedido", "numero de pedido"] },
  { k: "monto", l: "Monto liquidado (neto)", req: true, claves: ["importe total de la liquidacion", "total settlement amount", "settlement amount", "monto liquidado", "liquidado", "liquidacion", "settlement", "neto"] },
  { k: "fecha", l: "Fecha", claves: ["fecha de creacion", "order created time", "created time", "fecha del pedido", "fecha"] },
  { k: "producto", l: "Producto", claves: ["nombre del producto", "product name", "producto", "product", "sku"] },
  { k: "cantidad", l: "Cantidad", claves: ["cantidad", "quantity", "cant"] },
  { k: "tipo", l: "Tipo de transacción", claves: ["tipo de transaccion", "transaction type", "type"] },
  { k: "estado", l: "Estado", claves: ["estado", "status", "fecha de liquidacion", "order settled time", "settled time"] },
];

export function puntajeEncabezado(filas) {
  const todas = CAMPOS.flatMap((c) => c.claves);
  return Math.max(0, ...filas.slice(0, 15).map((f) => f.filter((c) => typeof c === "string" && todas.some((k) => norm(c).includes(k))).length));
}

export const esAjuste = (tipo) => !!tipo && !/^(pedido|order)$/i.test(String(tipo).trim());

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
      idx = hs.findIndex((h, i) => !usado.has(i) && h === clave);
      if (idx < 0) idx = hs.findIndex((h, i) => !usado.has(i) && h && h.includes(clave));
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

export const idsDe = (v) => String(v || "").split(/[,\s;|]+/).filter(Boolean);

// filas: [{id, fecha, producto, cantidad, monto, estado}]  ventas: filas de la tabla ventas (+ nombre de producto)
export function empatar(filas, ventas) {
  const usadas = new Set();
  const resultado = filas.map((f, i) => ({ f, i, accion: null, venta: null, score: 0, candidatos: [] }));

  // 1) Empate exacto por id_pedido_tiktok
  const porPedido = new Map();
  const incluidas = new Map(); // id suelto -> venta agrupada que ya lo contiene
  ventas.forEach((v) => {
    const ids = idsDe(v.id_pedido_tiktok);
    if (ids.length > 1) { ids.forEach((id) => incluidas.set(id, v)); return; }
    if (ids[0]) (porPedido.get(ids[0]) || porPedido.set(ids[0], []).get(ids[0])).push(v);
  });
  resultado.forEach((r) => {
    if (incluidas.has(r.f.id)) { r.venta = incluidas.get(r.f.id); r.accion = "incluida"; r.score = 10; return; }
    const lista = (porPedido.get(r.f.id) || []).filter((v) => !usadas.has(v.id_venta));
    if (!lista.length) return;
    lista.sort((a, b) => Math.abs(a.monto_neto - (r.f.monto ?? 0)) - Math.abs(b.monto_neto - (r.f.monto ?? 0)));
    r.venta = lista[0]; r.accion = "actualizar"; r.score = 10; usadas.add(lista[0].id_venta);
  });

  // 2) Sugerencia por monto (+ nombre si hay) entre ventas TikTok sin id
  const libres = ventas.filter((v) => !idsDe(v.id_pedido_tiktok).length && (v.canal === "TikTok" || !v.canal) && v.estado !== "Reembolso");
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

// Algunos reportes de TikTok declaran un rango de hoja menor al real (ej. A1:BC4 con 60 filas).
// Recalcula el rango a partir de las celdas que de verdad existen.
export function repararRangos(XLSX, libro) {
  for (const n of libro.SheetNames) {
    const ws = libro.Sheets[n];
    let r1 = Infinity, c1 = Infinity, r2 = -1, c2 = -1;
    for (const k of Object.keys(ws)) {
      if (k[0] === "!") continue;
      const { r, c } = XLSX.utils.decode_cell(k);
      if (r < r1) r1 = r; if (r > r2) r2 = r; if (c < c1) c1 = c; if (c > c2) c2 = c;
    }
    if (r2 >= 0) ws["!ref"] = XLSX.utils.encode_range({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  }
  return libro;
}

// TikTok reporta 1 fila por pieza; a veces el usuario capturó varias piezas como UNA venta sumada.
// Busca ventas libres cuyo monto sea la suma de varias filas sin asignar (mismo nombre primero, luego cualquiera).
export function agruparVentas(filasSueltas, ventasLibres, tol = 2) {
  const usadasFilas = new Set();
  const grupos = [];
  const ordenadas = [...ventasLibres].sort((a, b) => (b.cantidad - a.cantidad) || (b.monto_neto - a.monto_neto));

  function buscar(cands, objetivo, tam) {
    const arr = [...cands].sort((a, b) => b.f.monto - a.f.monto);
    if (arr.length < 2 || arr.length > 40) return null;
    const suf = new Array(arr.length + 1).fill(0);
    for (let i = arr.length - 1; i >= 0; i--) suf[i] = suf[i + 1] + arr[i].f.monto;
    const soluciones = []; let nodos = 0;
    (function dfs(i, suma, elegidas) {
      if (soluciones.length >= 40 || ++nodos > 300000) return;
      if (Math.abs(suma - objetivo) <= tol && elegidas.length >= 2) { soluciones.push([...elegidas]); }
      if (i >= arr.length || suma > objetivo + tol || suma + suf[i] < objetivo - tol) return;
      elegidas.push(arr[i]); dfs(i + 1, suma + arr[i].f.monto, elegidas); elegidas.pop();
      dfs(i + 1, suma, elegidas);
    })(0, 0, []);
    if (!soluciones.length) return null;
    soluciones.sort((a, b) => (Math.abs(a.length - tam) - Math.abs(b.length - tam)) || (b.length - a.length));
    return { sol: soluciones[0], exacta: soluciones[0].length === tam, ambigua: soluciones.length > 1 && soluciones[1].length === soluciones[0].length };
  }

  for (const v of ordenadas) {
    if (!(v.monto_neto > 0)) continue;
    const libres = filasSueltas.filter((r) => !usadasFilas.has(r.i) && r.f.monto > 0);
    // 1) filas con el mismo nombre de producto de reporte
    const porNombre = new Map();
    libres.forEach((r) => { const k = norm(r.f.producto); (porNombre.get(k) || porNombre.set(k, []).get(k)).push(r); });
    let hallado = null;
    for (const lista of porNombre.values()) { hallado = buscar(lista, v.monto_neto, v.cantidad); if (hallado) break; }
    // 2) mezcla de nombres (ej. todo capturado como una caja/superbox)
    if (!hallado) hallado = buscar(libres, v.monto_neto, v.cantidad);
    if (!hallado) continue;
    hallado.sol.forEach((r) => usadasFilas.add(r.i));
    grupos.push({ venta: v, filas: hallado.sol, suma: hallado.sol.reduce((t, r) => t + r.f.monto, 0), exacta: hallado.exacta, ambigua: hallado.ambigua });
  }
  return grupos;
}
