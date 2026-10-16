// Concilia el reporte de ingresos de TikTok Shop (pedidos ya liquidados) con las ventas capturadas a mano.
// Sin dependencias de UI. El empate NO usa el ID del pedido (tú no lo capturas): usa monto, fecha y nombre.
import { aNumero, aFecha, aId, similitud, idsDe, agruparVentas, repararRangos } from "./tiktok";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const dias = (a, b) => (a && b ? Math.abs((new Date(a) - new Date(b)) / 86400000) : null);
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- lectura del archivo ----------
const COL = {
  id: ["identificacion del pedido/ajuste", "order/adjustment id"],
  idPago: ["id del pago", "payment id"],
  fechaCta: ["fecha estado de cta", "statement date"],
  fechaPedido: ["fecha de creacion del pedido", "order created time"],
  entrega: ["fecha de entrega del pedido", "order delivered time"],
  producto: ["nombre del producto", "product name"],
  cantidad: ["cantidad", "quantity"],
  liq: ["importe total de la liquidacion", "total settlement amount"],
  neto: ["ventas netas de productos", "net sales"],
  tipo: ["tipo de transaccion", "transaction type"],
  estado: ["estado", "status"],
};

function mapear(encabezados) {
  const hs = encabezados.map(norm);
  const m = {};
  for (const [k, claves] of Object.entries(COL)) m[k] = hs.findIndex((h) => claves.includes(h));
  return m;
}

// libro: workbook de SheetJS. Devuelve { pedidos, pagos } o lanza Error con un mensaje entendible.
export function leerReporte(XLSX, libro) {
  repararRangos(XLSX, libro); // TikTok declara rangos de hoja más chicos que los reales
  let hojaPedidos = null;
  for (const n of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: "" });
    const hi = filas.findIndex((f) => f.some((c) => COL.id.includes(norm(c))) && f.some((c) => COL.liq.includes(norm(c))));
    if (hi >= 0) { hojaPedidos = { filas, hi }; break; }
  }
  if (!hojaPedidos) throw new Error("No encontré la hoja de pedidos. Sube el reporte de Ingresos de TikTok Shop (el que trae la hoja \"Detalles del pedido\").");

  const col = mapear(hojaPedidos.filas[hojaPedidos.hi]);
  const pedidos = [];
  for (const f of hojaPedidos.filas.slice(hojaPedidos.hi + 1)) {
    const id = col.id >= 0 ? aId(f[col.id]) : "";
    const liq = aNumero(f[col.liq]);
    if (!id || liq == null) continue;
    const tipo = col.tipo >= 0 ? norm(f[col.tipo]) : "pedido";
    const estado = col.estado >= 0 ? norm(f[col.estado]) : "pagado";
    pedidos.push({
      id, idPago: col.idPago >= 0 ? aId(f[col.idPago]) : "",
      fechaCta: col.fechaCta >= 0 ? aFecha(f[col.fechaCta]) : null,
      fecha: col.fechaPedido >= 0 ? aFecha(f[col.fechaPedido]) : null,
      entrega: col.entrega >= 0 ? aFecha(f[col.entrega]) : null,
      producto: col.producto >= 0 ? String(f[col.producto] ?? "") : "",
      cantidad: col.cantidad >= 0 ? aNumero(f[col.cantidad]) || 1 : 1,
      liq, neto: col.neto >= 0 ? aNumero(f[col.neto]) : null,
      esPedido: /^(pedido|order)$/.test(tipo), pagado: /pagad|paid|settled/.test(estado),
    });
  }

  // hoja "Pagos": un renglón por depósito a tu cuenta
  const pagos = [];
  for (const n of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: "" });
    const hi = filas.findIndex((f) => f.some((c) => norm(c) === "monto del pago") && f.some((c) => norm(c) === "id del pago"));
    if (hi < 0) continue;
    const hs = filas[hi].map(norm);
    const ix = (k) => hs.findIndex((h) => h === k);
    for (const f of filas.slice(hi + 1)) {
      const id = aId(f[ix("id del pago")]);
      if (!id) continue;
      pagos.push({ id, monto: aNumero(f[ix("monto del pago")]), fecha: aFecha(f[ix("fecha de finalizacion del pago")]) || aFecha(f[ix("fecha de inicio del pago")]), estado: String(f[ix("estado")] || "") });
    }
    break;
  }
  return { pedidos, pagos };
}

// ---------- empate ----------
// ventas: filas de `ventas` con producto_nombre. Devuelve grupos listos para aplicar.
export function conciliar(pedidos, ventas, { tol = 1.5, tolProbable = 0.1 } = {}) {
  const pedidosOk = pedidos.filter((p) => p.esPedido && p.pagado);
  const idsConciliados = new Set(ventas.filter((v) => v.id_pago_tiktok).flatMap((v) => idsDe(v.id_pedido_tiktok)));
  const ya = pedidosOk.filter((p) => idsConciliados.has(p.id));
  const pend = pedidosOk.filter((p) => !idsConciliados.has(p.id));
  const usadoP = new Set(); // ids de pedido
  const usadaV = new Set(); // id_venta
  const grupos = [];
  const porId = new Map(pend.map((p) => [p.id, p]));

  const candidatas = ventas.filter((v) => (v.canal === "TikTok" || !v.canal) && v.estado !== "Reembolso" && !v.id_pago_tiktok);

  // 0) ventas que ya traen el ID del pedido (importaciones anteriores): empate directo
  for (const v of candidatas) {
    const ps = idsDe(v.id_pedido_tiktok).map((id) => porId.get(id)).filter((p) => p && !usadoP.has(p.id));
    if (!ps.length) continue;
    ps.forEach((p) => usadoP.add(p.id)); usadaV.add(v.id_venta);
    grupos.push({ venta: v, pedidos: ps, via: "id", tipo: "exacto" });
  }

  const libresV = () => candidatas.filter((v) => !usadaV.has(v.id_venta));
  const libresP = () => pend.filter((p) => !usadoP.has(p.id));
  const pendiente = (v) => (v.estado === "En espera" || v.estado === "Sin empatar" || v.estado === "Revisar" ? 0 : 0.2);

  // 1) uno a uno por monto: lo capturado coincide con lo liquidado (o con el precio antes de comisión)
  const pares = [];
  for (const v of libresV()) for (const p of libresP()) {
    const dLiq = Math.abs(v.monto_neto - p.liq);
    const dNeto = p.neto != null ? Math.abs(v.monto_neto - p.neto) : Infinity;
    const dif = Math.min(dLiq, dNeto);
    if (dif > tol) continue;
    const dd = dias(v.fecha, p.fecha);
    if (dd != null && dd > 45) continue;
    const sim = similitud(p.producto, v.producto_nombre || "");
    const costo = (dLiq <= tol ? 0 : 0.5) + (dd == null ? 3 : Math.min(dd, 45) / 10) + pendiente(v) - sim * 2 + (Number(v.cantidad) === p.cantidad ? 0 : 1);
    pares.push({ v, p, costo, via: dLiq <= tol ? "liq" : "neto" });
  }
  pares.sort((a, b) => a.costo - b.costo);
  for (const x of pares) {
    if (usadaV.has(x.v.id_venta) || usadoP.has(x.p.id)) continue;
    usadaV.add(x.v.id_venta); usadoP.add(x.p.id);
    grupos.push({ venta: x.v, pedidos: [x.p], via: x.via, tipo: "exacto" });
  }

  // 2) varias filas de TikTok = una venta que capturaste sumada (ej. sobres sueltos como una caja)
  for (const base of ["liq", "neto"]) {
    const filas = libresP().filter((p) => p[base] > 0).map((p, i) => ({ i, p, f: { monto: p[base], producto: p.producto } }));
    const vs = libresV().filter((v) => v.monto_neto > 0 && Number(v.cantidad) > 1);
    for (const g of agruparVentas(filas, vs, tol)) {
      const ps = g.filas.map((r) => r.p).filter((p) => !usadoP.has(p.id));
      if (ps.length !== g.filas.length || usadaV.has(g.venta.id_venta)) continue;
      ps.forEach((p) => usadoP.add(p.id)); usadaV.add(g.venta.id_venta);
      grupos.push({ venta: g.venta, pedidos: ps, via: "suma", tipo: g.ambigua ? "probable" : "exacto" });
    }
  }

  // 3) probables: monto cercano (hasta 10%) y además mismo nombre o fechas pegadas
  const pr = [];
  for (const v of libresV()) for (const p of libresP()) {
    const dif = Math.min(Math.abs(v.monto_neto - p.liq), p.neto != null ? Math.abs(v.monto_neto - p.neto) : Infinity);
    const rel = v.monto_neto > 0 ? dif / v.monto_neto : 1;
    if (rel > tolProbable) continue;
    const sim = similitud(p.producto, v.producto_nombre || "");
    const dd = dias(v.fecha, p.fecha);
    if (!(sim > 0.2 || (dd != null && dd <= 5))) continue;
    pr.push({ v, p, costo: rel * 10 + (dd == null ? 3 : dd / 5) - sim * 2 + pendiente(v) });
  }
  pr.sort((a, b) => a.costo - b.costo);
  for (const x of pr) {
    if (usadaV.has(x.v.id_venta) || usadoP.has(x.p.id)) continue;
    usadaV.add(x.v.id_venta); usadoP.add(x.p.id);
    grupos.push({ venta: x.v, pedidos: [x.p], via: "aprox", tipo: "probable" });
  }

  for (const g of grupos) {
    g.liq = r2(g.pedidos.reduce((t, p) => t + p.liq, 0));
    g.neto = r2(g.pedidos.reduce((t, p) => t + (p.neto ?? 0), 0));
    g.idPago = [...new Set(g.pedidos.map((p) => p.idPago).filter(Boolean))].join(",");
    g.fechaCta = g.pedidos.map((p) => p.fechaCta).filter(Boolean).sort().pop() || null;
  }
  grupos.sort((a, b) => (a.tipo === b.tipo ? String(a.venta.fecha || "").localeCompare(String(b.venta.fecha || "")) : a.tipo === "exacto" ? -1 : 1));
  return {
    grupos,
    sinVenta: libresP(),
    enEspera: libresV().filter((v) => v.estado === "En espera"),
    ya,
  };
}
