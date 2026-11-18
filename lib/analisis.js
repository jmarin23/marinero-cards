// Cálculos del análisis del negocio. Todo sale de productos (v_productos), ventas, lotes (v_lotes) y config.
import { compacto, mxn } from "@/lib/format";

const num = (x) => Number(x || 0);
const DIA = 86400000;
const aFecha = (s) => (s ? new Date(String(s).slice(0, 10) + "T12:00:00") : null);
const dias = (a, b) => Math.round((b - a) / DIA);
const pctTxt = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(Math.round(x * 100))}%`;

export function analizar({ productos = [], ventas = [], lotes = [], config = {}, hoy = new Date() }) {
  const comision = config.tiktok_comision != null ? num(config.tiktok_comision) : 0.0905;
  const fijo = config.tiktok_fijo != null ? num(config.tiktok_fijo) : 46;
  const precioMinTikTok = (costo) => (costo + fijo) / (1 - comision);

  const prods = productos.filter((p) => p.categoria !== "Costo extra");
  const porId = new Map(productos.map((p) => [p.id_producto, p]));
  const vOk = ventas.filter((v) => v.estado !== "Reembolso");

  // primera venta por producto (para "días en venderse")
  const primera = new Map();
  for (const v of vOk) {
    if (!v.id_producto || !v.fecha) continue;
    const f = aFecha(v.fecha);
    if (!primera.has(v.id_producto) || f < primera.get(v.id_producto)) primera.set(v.id_producto, f);
  }

  // ---------- Categorías ----------
  const cats = new Map();
  for (const p of prods) {
    const k = p.categoria || "Otro";
    const c = cats.get(k) || { categoria: k, invertido: 0, piezas: 0, vendidas: 0, venta: 0, costoVendido: 0, invCosto: 0, invPzas: 0, diasVender: [] };
    const vend = num(p.vendidas);
    c.invertido += num(p.costo_total);
    c.piezas += num(p.cantidad);
    c.vendidas += vend;
    c.venta += num(p.venta_total);
    c.costoVendido += num(p.costo_unitario) * vend;
    c.invCosto += num(p.costo_inventario);
    c.invPzas += num(p.inventario);
    const pf = primera.get(p.id_producto), fc = aFecha(p.fecha_compra);
    if (pf && fc && pf >= fc) c.diasVender.push(dias(fc, pf));
    cats.set(k, c);
  }
  const categorias = [...cats.values()].map((c) => ({
    ...c,
    margen: c.venta - c.costoVendido,
    margenPct: c.costoVendido > 0 ? (c.venta - c.costoVendido) / c.costoVendido : null,
    rotacion: c.piezas > 0 ? c.vendidas / c.piezas : 0,
    diasPrimeraVenta: c.diasVender.length ? c.diasVender.reduce((a, b) => a + b, 0) / c.diasVender.length : null,
  })).sort((a, b) => b.invertido - a.invertido);

  // ---------- Lotes ----------
  const lotesA = lotes.filter((l) => num(l.costo) > 0).map((l) => {
    const costo = num(l.costo), venta = num(l.venta), g = num(l.ganancia_real);
    const recuperado = costo > 0 ? venta / costo : 0;
    const estado = g < 0 ? "perdida" : recuperado >= 1 ? "recuperado" : "en curso";
    return { id: l.id_lote, nombre: l.nombre, fecha: l.fecha, costo, venta, ganancia: g, roi: costo > 0 ? g / costo : 0, recuperado, falta: Math.max(costo - venta, 0), pzas: num(l.pzas_inventario), invCosto: num(l.inventario_a_costo), estado };
  }).sort((a, b) => b.roi - a.roi);

  // ---------- Inventario: antigüedad y estancado ----------
  const enBodega = prods.filter((p) => num(p.inventario) > 0);
  const invTotal = enBodega.reduce((t, p) => t + num(p.costo_inventario), 0);
  const cortes = [["0 a 30 días", 0, 30], ["31 a 60 días", 31, 60], ["61 a 90 días", 61, 90], ["Más de 90 días", 91, 1e9]];
  const antiguedad = cortes.map(([nombre, a, b]) => ({
    nombre,
    costo: enBodega.filter((p) => num(p.dias_en_inventario) >= a && num(p.dias_en_inventario) <= b).reduce((t, p) => t + num(p.costo_inventario), 0),
  }));
  const estancados = enBodega
    .filter((p) => num(p.dias_en_inventario) > 30 && (!p.ultima_venta || dias(aFecha(p.ultima_venta), hoy) > 30))
    .map((p) => {
      const cu = num(p.costo_unitario), vend = num(p.vendidas);
      return { id: p.id_producto, nombre: p.nombre, categoria: p.categoria, pzas: num(p.inventario), invCosto: num(p.costo_inventario), dias: num(p.dias_en_inventario), costoUnit: cu, precioPromedio: vend > 0 ? num(p.venta_total) / vend : null, minTikTok: precioMinTikTok(cu) };
    })
    .sort((a, b) => b.invCosto - a.invCosto);
  const capitalAtrapado = estancados.reduce((t, p) => t + p.invCosto, 0);

  // ---------- Ritmo ----------
  const mes = (d) => String(d).slice(0, 7);
  const ventasMes = new Map(), invMes = new Map();
  for (const v of vOk) if (v.fecha) ventasMes.set(mes(v.fecha), (ventasMes.get(mes(v.fecha)) || 0) + num(v.monto_neto));
  for (const p of productos) {
    const f = p.fecha_compra || (p.creado_en ? String(p.creado_en).slice(0, 10) : null);
    if (f) invMes.set(mes(f), (invMes.get(mes(f)) || 0) + num(p.costo_total));
  }
  const todosMeses = [...new Set([...ventasMes.keys(), ...invMes.keys()])].sort();
  const meses = todosMeses.map((m) => ({ mes: m, ventas: ventasMes.get(m) || 0, inversion: invMes.get(m) || 0 }));

  const sumaVentas = (desde, hasta) => vOk.filter((v) => v.fecha && aFecha(v.fecha) >= desde && aFecha(v.fecha) < hasta).reduce((t, v) => t + num(v.monto_neto), 0);
  const hace = (n) => new Date(hoy.getTime() - n * DIA);
  const ult4 = sumaVentas(hace(28), new Date(hoy.getTime() + DIA));
  const ant4 = sumaVentas(hace(56), hace(28));
  const tendencia = ant4 > 0 ? (ult4 - ant4) / ant4 : null;

  // cuánto costo de mercancía se ha ido en los últimos 60 días -> días para liquidar el inventario
  let costoVend60 = 0;
  for (const v of vOk) {
    if (!v.id_producto || !v.fecha || aFecha(v.fecha) < hace(60)) continue;
    const p = porId.get(v.id_producto);
    if (p) costoVend60 += num(p.costo_unitario) * num(v.cantidad);
  }
  const quemaDia = costoVend60 / 60;
  const diasLiquidar = quemaDia > 0 ? invTotal / quemaDia : null;

  // ---------- Canales ----------
  const can = new Map();
  for (const v of ventas) {
    const k = v.canal || "Sin canal";
    const c = can.get(k) || { canal: k, monto: 0, piezas: 0, n: 0, reembolsos: 0, montoReemb: 0, enEspera: 0, sinEmpatar: 0 };
    c.n += 1;
    if (v.estado === "Reembolso") { c.reembolsos += 1; c.montoReemb += num(v.monto_neto); }
    else {
      c.monto += num(v.monto_neto); c.piezas += num(v.cantidad);
      if (v.estado === "En espera") c.enEspera += num(v.monto_neto);
      if (v.estado === "Sin empatar") c.sinEmpatar += num(v.monto_neto);
    }
    can.set(k, c);
  }
  const totalVend = [...can.values()].reduce((t, c) => t + c.monto, 0) || 1;
  const canales = [...can.values()].map((c) => ({ ...c, ticket: c.n - c.reembolsos > 0 ? c.monto / (c.n - c.reembolsos) : 0, parte: c.monto / totalVend, reembPct: c.n > 0 ? c.reembolsos / c.n : 0 })).sort((a, b) => b.monto - a.monto);
  const sinEmpatar = canales.reduce((t, c) => t + c.sinEmpatar, 0);

  // ---------- Hallazgos en texto ----------
  const h = [];
  const confiables = categorias.filter((c) => c.vendidas >= 5 && c.margenPct != null);
  if (confiables.length >= 2) {
    const mejor = [...confiables].sort((a, b) => b.margenPct - a.margenPct)[0];
    const peor = [...confiables].sort((a, b) => a.margenPct - b.margenPct)[0];
    h.push({ tono: "bueno", titulo: `${mejor.categoria} es lo que mejor te deja`, texto: `Margen de ${pctTxt(mejor.margenPct)} sobre el costo de lo ya vendido (${compacto(mejor.margen)} de ganancia en ${mejor.vendidas} piezas).` });
    if (peor.categoria !== mejor.categoria) h.push({ tono: peor.margenPct < 0 ? "alerta" : "info", titulo: `${peor.categoria} es lo que menos te deja`, texto: `Margen de ${pctTxt(peor.margenPct)} sobre lo vendido.${peor.margenPct < 0 ? " Lo vendido hasta ahora no cubre su costo." : ""}` });
  }
  const rapidas = categorias.filter((c) => c.diasPrimeraVenta != null && c.diasVender.length >= 3).sort((a, b) => a.diasPrimeraVenta - b.diasPrimeraVenta);
  if (rapidas.length) h.push({ tono: "info", titulo: `${rapidas[0].categoria} es lo que más rápido arranca`, texto: `Tarda en promedio ${Math.round(rapidas[0].diasPrimeraVenta)} días desde la compra hasta la primera venta.` });
  const perd = lotesA.filter((l) => l.estado === "perdida");
  if (perd.length) h.push({ tono: "alerta", titulo: `${perd.length} ${perd.length === 1 ? "lote va" : "lotes van"} en pérdida`, texto: `${perd.slice(0, 3).map((l) => `${l.nombre} (${compacto(l.ganancia)})`).join(", ")}${perd.length > 3 ? " y más" : ""}.` });
  if (lotesA.length) { const top = lotesA[0]; h.push({ tono: "bueno", titulo: `Mejor lote: ${top.nombre}`, texto: `ROI de ${pctTxt(top.roi)} con ${compacto(top.ganancia)} de ganancia.` }); }
  if (capitalAtrapado > 0 && invTotal > 0) h.push({ tono: "alerta", titulo: `${compacto(capitalAtrapado)} atrapados en producto parado`, texto: `Es el ${Math.round((capitalAtrapado / invTotal) * 100)}% de tu inventario a costo, con más de 30 días sin venderse (${estancados.length} productos).` });
  if (tendencia != null) h.push({ tono: tendencia >= 0 ? "bueno" : "alerta", titulo: `Ventas ${tendencia >= 0 ? "subiendo" : "bajando"}`, texto: `Últimas 4 semanas: ${compacto(ult4)} contra ${compacto(ant4)} en las 4 anteriores (${pctTxt(tendencia)}).` });
  if (diasLiquidar != null) h.push({ tono: diasLiquidar > 180 ? "alerta" : "info", titulo: `Inventario para ~${Math.round(diasLiquidar)} días`, texto: `Al ritmo de los últimos 60 días, vender los ${compacto(invTotal)} que tienes en bodega tomaría unos ${Math.round(diasLiquidar / 30)} meses.` });
  const reemb = canales.filter((c) => c.n >= 10 && c.reembPct >= 0.05)[0];
  if (reemb) h.push({ tono: "alerta", titulo: `Reembolsos altos en ${reemb.canal}`, texto: `${Math.round(reemb.reembPct * 100)}% de las ventas (${reemb.reembolsos} de ${reemb.n}) terminó en reembolso, ${mxn(reemb.montoReemb)}.` });
  if (sinEmpatar > 0) h.push({ tono: "info", titulo: `${compacto(sinEmpatar)} en ventas sin empatar`, texto: "Cuentan en el total pero todavía no están ligadas a un pago de TikTok. Conviene revisar que no se haya quedado nada sin cobrar." });

  return { categorias, lotes: lotesA, antiguedad, estancados, capitalAtrapado, invTotal, meses, ult4, ant4, tendencia, diasLiquidar, quemaDia, canales, sinEmpatar, hallazgos: h, comision, fijo };
}
