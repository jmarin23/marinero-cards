"use client";
import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

const CANALES = ["TikTok", "Externa", "Mercado Libre"];
const leer = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const guardarLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

// Hoja para vender en 2 toques desde el inventario: piezas, total (ya calculado) y listo.
export default function VentaRapida({ prod, onClose, onSaved }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const reventa = Number(prod.reventa) || 0;
  const [cant, setCant] = useState(1);
  const [monto, setMonto] = useState(reventa ? String(reventa) : "");
  const [auto, setAuto] = useState(true);
  const [canal, setCanal] = useState(() => leer("canalVenta", "TikTok"));
  const [estado, setEstado] = useState(() => (leer("canalVenta", "TikTok") === "TikTok" ? "En espera" : "Pagado"));
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [cliente, setCliente] = useState("");
  const [err, setErr] = useState("");
  const [guardando, setGuardando] = useState(false);
  const quedan = Number(prod.inventario);

  function cambiaCant(n) {
    const v = Math.max(1, Math.min(quedan, n));
    setCant(v);
    if (auto && reventa) setMonto(String(Math.round(reventa * v * 100) / 100));
  }
  function elegirCanal(c) {
    setCanal(c); setEstado(c === "TikTok" ? "En espera" : "Pagado"); guardarLS("canalVenta", c);
  }

  async function vender() {
    setGuardando(true); setErr("");
    const { data: ult } = await sb.from("ventas").select("id_venta").like("id_venta", "V%").order("id_venta", { ascending: false }).limit(1);
    const id = "V" + String((ult?.[0] ? parseInt(ult[0].id_venta.slice(1), 10) : 0) + 1).padStart(4, "0");
    const { error } = await sb.from("ventas").insert({
      id_venta: id, fecha: fecha || null, id_producto: prod.id_producto, id_lote: prod.id_lote,
      canal, cantidad: cant, monto_neto: Number(monto), estado, cliente_notas: cliente.trim() || null,
    });
    setGuardando(false);
    if (error) return setErr("No se guardó: " + error.message);
    onSaved?.(`Vendido: ${cant} × ${prod.nombre} por ${mxn(Number(monto))}`);
  }

  const gan = monto ? Number(monto) - Number(prod.costo_unitario || 0) * cant : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center" onClick={onClose}>
      <div className="max-h-[92vh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-[#171b21] p-5 sm:max-w-md sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold">{prod.nombre}</div>
            <div className="text-xs text-white/50">Quedan {quedan} · costo {mxn(prod.costo_unitario)} c/u{reventa ? ` · reventa ${mxn(reventa)}` : ""}</div>
          </div>
          <button className="text-sm text-white/50" onClick={onClose}>Cerrar</button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-white/15 p-2">
          <button className="h-12 w-14 rounded-lg bg-white/10 text-2xl" onClick={() => cambiaCant(cant - 1)} disabled={cant <= 1}>−</button>
          <div className="text-center">
            <div className="text-3xl font-bold">{cant}</div>
            <div className="text-xs text-white/50">{cant === 1 ? "pieza" : "piezas"}</div>
          </div>
          <button className="h-12 w-14 rounded-lg bg-white/10 text-2xl" onClick={() => cambiaCant(cant + 1)} disabled={cant >= quedan}>+</button>
        </div>

        <label className="block text-sm text-white/60">Total que te queda (MXN)
          <input className="input mt-1 text-xl font-semibold" type="number" inputMode="decimal" autoFocus={!monto} value={monto}
            onChange={(e) => { setMonto(e.target.value); setAuto(false); }} placeholder="0" />
        </label>
        {cant > 1 && monto && <p className="-mt-2 text-sm text-white/60">{mxn(Number(monto) / cant)} c/u</p>}

        <div className="grid grid-cols-3 gap-2">
          {CANALES.map((c) => (
            <button key={c} onClick={() => elegirCanal(c)}
              className={`rounded-lg border py-3 text-sm ${canal === c ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15"}`}>{c}</button>
          ))}
        </div>

        <details className="text-sm text-white/60">
          <summary className="cursor-pointer">Fecha, estado y cliente (opcional)</summary>
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
                {["En espera", "Pagado"].map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
            <input className="input" placeholder="Cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </div>
        </details>

        {gan !== null && <p className={`text-sm ${gan >= 0 ? "text-emerald-400" : "text-red-400"}`}>Ganancia estimada: {mxn(gan)}</p>}
        {err && <p className="text-sm text-red-300">{err}</p>}
        <button className="btn w-full !py-4 text-lg" onClick={vender} disabled={guardando || !(Number(monto) > 0)}>
          {guardando ? "Guardando…" : `Vender${Number(monto) > 0 ? " · " + mxn(Number(monto)) : ""}`}
        </button>
      </div>
    </div>
  );
}
