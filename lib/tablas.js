import { mxn } from "@/lib/format";

// Configuración de cada tabla editable.
const CATEGORIAS = ["Pokémon", "MLB", "NFL", "NBA", "Fut", "Costo extra", "Otro"];
const CANALES = ["TikTok", "Externa", "Mercado Libre"];
const ESTADOS = ["Sin empatar", "En espera", "Pagado", "Cobrado", "Reembolso", "Revisar"];

// Quita de la nota los avisos que venían del Excel ("Revisar: 4 montos vs 3 vendidas")
export const notaLimpia = (n) => String(n || "").replace(/(?:^|\s*\|\s*)Revisar:[^|]*/, "").replace(/^\s*\|\s*/, "").trim();
const lotesOpt = { tabla: "lotes", valor: "id_lote", etiqueta: "nombre", extra: true };
const prodOpt = { tabla: "productos", valor: "id_producto", etiqueta: "nombre", extra: true };

export const TABLAS = {
  lotes: {
    titulo: "Lotes", pk: "id_lote", prefijo: "L", pad: 2, vista: "v_lotes", orden: "id_lote",
    titulo_campo: "nombre", sub: (r) => `${r.id_lote} · ${r._nprod || 0} productos · ${r._socios ? "Socio: " + r._socios : "sin socio"}${Number(r.venta) ? " · vendido " + mxn(r.venta) : ""}`,
    derecha: (r) => ({ k: "ganancia_real", t: "ganancia" }),
    campos: [
      { k: "nombre", l: "Nombre", t: "text", req: true },
      { k: "fecha", l: "Fecha", t: "date" },
      { k: "proveedor_notas", l: "Proveedor / notas", t: "text" },
      { k: "_socio", l: "Socio de este lote (o Yo) — se aplica a todos sus productos", t: "text", lista: "socios", virtual: true },
      { k: "_quien", l: "Quién puso el costo — se aplica a todos sus productos", t: "select", opciones: ["Yo", "Socio"], virtual: true },
    ],
    // Los datos de socio viven en cada producto; aquí se reparten a todos los del lote (vacío = no cambiar)
    despues: async (sb, id, d) => {
      const c = {};
      if (d._socio) c.socio = d._socio;
      if (d._quien) c.quien_puso_costo = d._quien;
      if (!Object.keys(c).length) return null;
      const { error } = await sb.from("productos").update(c).eq("id_lote", id);
      return error ? "El lote se guardó pero no pude actualizar sus productos: " + error.message : null;
    },
  },
  productos: {
    titulo: "Productos (compras)", pk: "id_producto", prefijo: "P", pad: 3, vista: "v_productos", orden: "id_producto",
    titulo_campo: "nombre", sub: (r) => `${r.id_producto} · ${r.id_lote || "sin lote"} · ${r.socio || ""} · ${Number(r.cantidad)} pzas${Number(r.cantidad) > 1 ? ` · ${mxn(r.costo_unitario)} c/u` : ""}${Number(r.reventa) > 0 && Number(r.costo_unitario) > 0 ? ` → ${mxn(r.reventa)} (${((Number(r.reventa) / Number(r.costo_unitario) - 1) * 100) >= 0 ? "+" : ""}${Math.round((Number(r.reventa) / Number(r.costo_unitario) - 1) * 100)}%)` : ""} · inv ${Number(r.inventario || 0)}`,
    derecha: () => ({ k: "ganancia_real", t: "ganancia" }),
    campos: [
      { k: "id_lote", l: "Lote", t: "select", opciones: lotesOpt },
      { k: "nombre", l: "Nombre", t: "text", req: true },
      { k: "categoria", l: "Categoría", t: "select", opciones: CATEGORIAS },
      { k: "socio", l: "Socio (o Yo)", t: "text", lista: "socios" },
      { k: "quien_puso_costo", l: "Quién puso el costo", t: "select", opciones: ["Yo", "Socio"] },
      { k: "cantidad", l: "Cantidad", t: "number", req: true },
      { k: "_unitario", l: "Costo unitario (MXN) — se calcula solo, o escríbelo y se ajusta el total", t: "number", virtual: true },
      { k: "costo_total", l: "Costo total (MXN)", t: "number", req: true },
      { k: "reventa", l: "Reventa objetivo (por pieza, MXN)", t: "number" },
      { k: "fecha_compra", l: "Fecha de compra", t: "date" },
    ],
  },
  ventas: {
    titulo: "Ventas", pk: "id_venta", prefijo: "V", pad: 4, vista: "ventas", orden: "id_venta", desc: true,
    titulo_fn: (r) => r._producto || r.id_producto || notaLimpia(r.cliente_notas).split("|")[0].trim() || "Venta suelta", titulo_campo: "id_producto", sub: (r) => `${Number(r.cantidad)} ${Number(r.cantidad) === 1 ? "pza" : "pzas"} · ${mxn(Number(r.monto_neto) / (Number(r.cantidad) || 1))} c/u · ${r.id_venta} · ${r.fecha || "sin fecha"} · ${r.canal || "sin canal"} · ${r.estado}${r.id_producto ? "" : " · venta suelta"}${notaLimpia(r.cliente_notas) && (r.id_producto || notaLimpia(r.cliente_notas).includes("|")) ? " · " + (r.id_producto ? notaLimpia(r.cliente_notas) : notaLimpia(r.cliente_notas).split("|").slice(1).join("|").trim()) : ""}`,
    derecha: () => ({ k: "monto_neto", t: "monto" }),
    campos: [
      { k: "fecha", l: "Fecha", t: "date" },
      { k: "id_producto", l: "Producto", t: "select", opciones: prodOpt },
      { k: "id_lote", l: "Lote", t: "select", opciones: lotesOpt },
      { k: "canal", l: "Canal", t: "select", opciones: CANALES },
      { k: "cantidad", l: "Cantidad", t: "number", req: true },
      { k: "monto_neto", l: "Monto neto (MXN)", t: "number", req: true },
      { k: "estado", l: "Estado", t: "select", opciones: ESTADOS, req: true },
      { k: "cliente_notas", l: "Cliente / notas", t: "text" },
      { k: "_socio", l: "Socio — quién se asoció conmigo en este producto (o escribe Yo)", t: "text", lista: "socios", virtual: true },
      { k: "_quien", l: "¿Quién pagó el costo? (Yo = lo pagué yo)", t: "select", opciones: ["Yo", "Socio"], virtual: true },
      { k: "_alcance", l: "Aplicar socio y costo a", t: "select", opciones: ["Solo este producto", "Todo el lote"], virtual: true },
    ],
    // El socio vive en el producto: aquí se edita desde la venta (vacío = no cambiar)
    despues: async (sb, id, d) => {
      if (!d.id_producto) return null;
      const c = {};
      if (d._socio) c.socio = d._socio;
      if (d._quien) c.quien_puso_costo = d._quien;
      if (!Object.keys(c).length) return null;
      let q = sb.from("productos").update(c);
      if (d._alcance === "Todo el lote") {
        const { data } = await sb.from("productos").select("id_lote").eq("id_producto", d.id_producto).single();
        q = data?.id_lote ? q.eq("id_lote", data.id_lote) : q.eq("id_producto", d.id_producto);
      } else q = q.eq("id_producto", d.id_producto);
      const { error } = await q;
      return error ? "La venta se guardó pero no pude actualizar el socio: " + error.message : null;
    },
  },
  inventario: {
    tabla: "productos", vender: true, titulo: "Inventario", pk: "id_producto", prefijo: "P", pad: 3, vista: "v_productos", orden: "nombre",
    filtro: (r) => Number(r.inventario) > 0 && r.categoria !== "Costo extra",
    chips: ["categoria", "socio", "id_lote"],
    titulo_campo: "nombre",
    sub: (r) => `${r.id_producto} · ${r.id_lote || "sin lote"} · ${r.socio || ""} · quedan ${Number(r.inventario)} de ${Number(r.cantidad)} · ${mxn(r.costo_unitario)} c/u${Number(r.reventa) > 0 && Number(r.costo_unitario) > 0 ? ` → ${mxn(r.reventa)} (${Math.round((Number(r.reventa) / Number(r.costo_unitario) - 1) * 100)}%)` : ""}`,
    derecha: () => ({ k: "costo_inventario", t: "monto" }),
    resumen: (rs) => {
      const piezas = rs.reduce((a, r) => a + Number(r.inventario), 0);
      const costo = rs.reduce((a, r) => a + Number(r.costo_inventario), 0);
      const reventa = rs.reduce((a, r) => a + Number(r.inventario) * Number(r.reventa || r.costo_unitario), 0);
      return [
        { l: "Piezas", v: piezas.toLocaleString("es-MX") },
        { l: "A costo", v: mxn(costo) },
        { l: "A reventa", v: mxn(reventa) },
        { l: "Margen esperado", v: costo > 0 ? `${Math.round((reventa / costo - 1) * 100)}%` : "—" },
      ];
    },
    get campos() { return TABLAS.productos.campos; },
  },
  pagos_socios: {
    titulo: "Pagos a socios", pk: "id_pago", prefijo: "PG", pad: 4, vista: "pagos_socios", orden: "id_pago", desc: true,
    titulo_campo: "socio", sub: (r) => `${r.id_pago} · ${r.tipo || ""} · ${r.fecha || "sin fecha"} · ${r._producto || r._lote || ""}`,
    derecha: () => ({ k: "monto", t: "monto" }),
    campos: [
      { k: "fecha", l: "Fecha", t: "date" },
      { k: "socio", l: "Socio", t: "text", req: true, lista: "socios" },
      { k: "tipo", l: "Tipo", t: "select", opciones: ["Costo", "Ganancia"] },
      { k: "id_producto", l: "Producto (opcional)", t: "select", opciones: prodOpt },
      { k: "id_lote", l: "Lote completo (opcional)", t: "select", opciones: lotesOpt },
      { k: "monto", l: "Monto (MXN)", t: "number", req: true },
      { k: "notas", l: "Notas", t: "text" },
    ],
  },
  cartas: {
    titulo: "Cartas", pk: "id_carta", prefijo: "C", pad: 3, vista: "cartas", orden: "id_carta",
    titulo_campo: "nombre", sub: (r) => `${r.id_carta} · ${r.deporte || "sin deporte"} · ${Number(r.valor_venta) > 0 ? "VENDIDA" : "disponible"}`,
    derecha: () => ({ k: "valoracion", t: "monto" }),
    campos: [
      { k: "nombre", l: "Nombre", t: "text", req: true },
      { k: "valoracion", l: "Valoración (MXN)", t: "number" },
      { k: "valor_venta", l: "Valor de venta (>0 = vendida)", t: "number" },
      { k: "deporte", l: "Deporte / categoría", t: "text" },
      { k: "foto", l: "Foto (URL)", t: "text" },
    ],
  },
};
