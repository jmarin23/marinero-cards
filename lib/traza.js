const n = (x) => Number(x || 0);

// De dónde salió el costo de cada producto: producto, envío, tax de USA, aduana y cruce (misma fórmula de Compra).
// Solo se arma si el lote tiene datos de compra guardados y todos sus productos tienen precio original.
export function calcularTrazas(prods, compras, origen) {
  const out = {};
  const porLote = {};
  prods.forEach((p) => { if (p.id_lote) (porLote[p.id_lote] ||= []).push(p); });
  for (const [idLote, ps] of Object.entries(porLote)) {
    const cp = compras[idLote];
    if (!cp || ps.some((p) => origen[p.id_producto] == null)) continue; // sin datos guardados no se inventa nada
    const f = cp.moneda === "USD" ? n(cp.tc) || 1 : 1;
    const tax = cp.moneda === "USD" ? n(cp.taxUsa) / 100 : 0;
    const sumaSub = ps.reduce((t, p) => t + origen[p.id_producto] * n(p.cantidad), 0);
    for (const p of ps) {
      const sub = origen[p.id_producto] * n(p.cantidad);
      const envioParte = sumaSub > 0 ? (n(cp.envio) * sub) / sumaSub : 0;
      const cruceParte = sumaSub > 0 ? (n(cp.cruce) * sub) / sumaSub : 0; // el cruce ya viene en MXN y no paga aduana
      const t = {
        producto: sub * f, envio: envioParte * f, tax: sub * tax * f, aduana: (sub + envioParte) * f * (n(cp.aduana) / 100), cruce: cruceParte,
        precio: origen[p.id_producto], moneda: cp.moneda === "USD" ? "USD" : "MXN", cant: n(p.cantidad),
      };
      t.ajuste = n(p.costo_total) - (t.producto + t.envio + t.tax + t.aduana + t.cruce); // lo que se movió a mano después
      out[p.id_producto] = t;
    }
  }
  return out;
}

// Lo que se le regresa al socio que puso el costo: lo que se pagó en la compra (producto + envío + tax de USA).
// La aduana y el cruce los paga David en efectivo, no se le regresan. Sin desglose guardado se usa el costo completo.
export function deudaCosto(p, trazas) {
  const t = trazas[p.id_producto];
  if (!t) return n(p.costo_total);
  return Math.max(t.producto + t.envio + t.tax + t.ajuste, 0);
}
