// Los socios viven como texto en cada producto. Los que se agregan a mano (aún sin productos)
// y su % propio se guardan en la tabla config con la clave "pct:<nombre>", así no hace falta tocar la base.
export const PREFIJO_PCT = "pct:";

export async function listaSocios(sb) {
  const [p, c] = await Promise.all([
    sb.from("productos").select("socio").range(0, 4999),
    sb.from("config").select("clave").like("clave", PREFIJO_PCT + "%"),
  ]);
  const deProductos = (p.data || []).map((x) => x.socio).filter((s) => s && !["Yo", "—"].includes(s));
  const deConfig = (c.data || []).map((x) => x.clave.slice(PREFIJO_PCT.length));
  return [...new Set([...deProductos, ...deConfig])].sort((a, b) => a.localeCompare(b));
}
