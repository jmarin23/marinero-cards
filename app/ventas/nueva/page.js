"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

const CANALES = ["TikTok", "Externa", "Mercado Libre"];

export default function NuevaVenta() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [productos, setProductos] = useState([]);
  const [q, setQ] = useState("");
  const [prod, setProd] = useState(null);
  const [canal, setCanal] = useState("TikTok");
  const [cantidad, setCantidad] = useState(1);
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const hoy = () => new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy());
  const [estado, setEstado] = useState("En espera");
  const [montoAuto, setMontoAuto] = useState(true); // el monto se calcula solo (reventa x piezas) hasta que lo escribes tú
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data } = await sb.from("v_productos").select("id_producto,id_lote,nombre,categoria,inventario,costo_unitario,reventa")
      .gt("inventario", 0).neq("categoria", "Costo extra").order("nombre");
    setProductos(data || []);
  }
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = t ? productos.filter((p) => p.nombre.toLowerCase().includes(t) || p.id_producto.toLowerCase().includes(t)) : productos;
    return lista.slice(0, 30);
  }, [q, productos]);

  async function guardar() {
    if (!prod || !monto) return;
    setGuardando(true); setMsg(null);
    // siguiente ID: V0001, V0002...
    const { data: ult } = await sb.from("ventas").select("id_venta").like("id_venta", "V%").order("id_venta", { ascending: false }).limit(1);
    const n = ult?.[0] ? parseInt(ult[0].id_venta.slice(1), 10) + 1 : 1;
    const id = "V" + String(n).padStart(4, "0");
    const { error } = await sb.from("ventas").insert({
      id_venta: id,
      fecha: fecha || null,
      id_producto: prod.id_producto,
      id_lote: prod.id_lote,
      canal,
      cantidad: Number(cantidad),
      monto_neto: Number(monto),
      estado,
      cliente_notas: notas || null,
    });
    setGuardando(false);
    if (error) { setMsg({ ok: false, t: "No se guardó: " + error.message }); return; }
    setMsg({ ok: true, t: `Venta ${id} guardada: ${prod.nombre}` });
    setProd(null); setMonto(""); setCantidad(1); setNotas(""); setQ(""); setMontoAuto(true);
    cargar();
  }

  const ganancia = prod && monto ? Number(monto) - Number(prod.costo_unitario) * Number(cantidad) : null;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Nueva venta</h1>

      {msg && <div className={`card ${msg.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{msg.t}</div>}

      {!prod ? (
        <section className="space-y-2">
          <input className="input" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {filtrados.map((p) => (
            <button key={p.id_producto} onClick={() => { setProd(p); setMontoAuto(true); setCantidad(1); setMonto(p.reventa ? String(p.reventa) : ""); }}
              className="card flex w-full items-center justify-between gap-3 text-left active:bg-white/10">
              <span className="min-w-0">
                <span className="block truncate">{p.nombre}</span>
                <span className="text-xs text-white/50">{p.id_producto} · {p.categoria}</span>
              </span>
              <span className="shrink-0 text-sm text-amber-400">{Number(p.inventario)} pzas</span>
            </button>
          ))}
          {filtrados.length === 0 && <p className="text-sm text-white/50">Sin resultados.</p>}
        </section>
      ) : (
        <section className="space-y-4">
          <div className="card flex items-start justify-between gap-3">
            <div>
              <div>{prod.nombre}</div>
              <div className="text-xs text-white/50">{prod.id_producto} · quedan {Number(prod.inventario)} · costo c/u {mxn(prod.costo_unitario)}</div>
            </div>
            <button className="text-sm text-amber-400" onClick={() => setProd(null)}>Cambiar</button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {CANALES.map((c) => (
              <button key={c} onClick={() => { setCanal(c); setEstado(c === "TikTok" ? "En espera" : "Cobrado"); }}
                className={`rounded-lg border py-3 text-sm ${canal === c ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15"}`}>{c}</button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-white/60">Piezas vendidas
              <input className="input mt-1 text-lg font-semibold" type="number" min="1" max={Number(prod.inventario)} value={cantidad}
                onChange={(e) => { setCantidad(e.target.value); if (montoAuto && prod.reventa) setMonto(String(Math.round(Number(prod.reventa) * Number(e.target.value || 0) * 100) / 100)); }} />
            </label>
            <label className="text-sm text-white/60">Total que te queda (MXN)
              <input className="input mt-1 text-lg font-semibold" type="number" inputMode="decimal" value={monto} onChange={(e) => { setMonto(e.target.value); setMontoAuto(false); }} placeholder="lo que te queda" />
            </label>
          </div>
          {Number(cantidad) > 1 && monto && (
            <p className="text-sm text-white/60">{Number(cantidad)} pzas · {mxn(Number(monto) / Number(cantidad))} c/u</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-white/60">Fecha de la venta
              <input className="input mt-1" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="text-sm text-white/60">Estado
              <select className="input mt-1" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {["En espera", "Pagado", "Cobrado"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
          </div>

          <input className="input" placeholder="Cliente / notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />

          {ganancia !== null && (
            <p className={`text-sm ${ganancia >= 0 ? "text-emerald-400" : "text-red-400"}`}>Ganancia estimada: {mxn(ganancia)}</p>
          )}

          <button className="btn w-full" onClick={guardar} disabled={guardando || !monto || Number(cantidad) < 1 || Number(cantidad) > Number(prod.inventario)}>
            {guardando ? "Guardando…" : "Guardar venta"}
          </button>
        </section>
      )}
    </div>
  );
}
