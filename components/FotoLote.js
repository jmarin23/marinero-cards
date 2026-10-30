"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { comprimirImagen } from "@/lib/foto";

const SQL = "alter table lotes add column if not exists foto text;";

// Foto del pedido de un lote (la captura de la orden con subtotal, tax y total). Se guarda en lotes.foto.
export default function FotoLote({ idLote }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [foto, setFoto] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [err, setErr] = useState("");
  const [grande, setGrande] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const { data, error } = await sb.from("lotes").select("foto").eq("id_lote", idLote).maybeSingle();
    if (error) { setFalta(true); setFoto(null); } else { setFalta(false); setFoto(data?.foto || null); }
    setCargando(false);
  }
  useEffect(() => { setCargando(true); cargar(); }, [idLote]);

  async function guardar(valor) {
    setOcupado(true); setErr("");
    const { error } = await sb.from("lotes").update({ foto: valor }).eq("id_lote", idLote);
    setOcupado(false);
    if (error) return setErr(error.message);
    setFoto(valor);
  }
  async function elegir(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { await guardar(await comprimirImagen(f)); } catch (x) { setErr(x.message); }
  }

  if (cargando) return null;
  if (falta) {
    return (
      <div className="card space-y-2 border-amber-500/40 text-sm text-amber-300">
        <p>Para guardar la foto del pedido corre esto una vez en Supabase (SQL Editor) y vuelve a abrir:</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-white/80">{SQL}</pre>
      </div>
    );
  }
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/70">Foto del pedido</span>
        <span className="flex gap-4 text-xs">
          <label className="cursor-pointer text-amber-300">
            {foto ? "Cambiar" : "＋ Agregar"}
            <input type="file" accept="image/*" className="hidden" onChange={elegir} disabled={ocupado} />
          </label>
          {foto && <button className="text-red-400" disabled={ocupado} onClick={() => { if (confirm("¿Quitar la foto de este lote?")) guardar(null); }}>Quitar</button>}
        </span>
      </div>
      {ocupado && <p className="text-xs text-white/50">Guardando…</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
      {foto ? (
        <button className="block w-full" onClick={() => setGrande(true)}>
          <img src={foto} alt="Pedido del lote" className="max-h-56 w-full rounded-lg object-cover object-top" />
          <span className="mt-1 block text-xs text-white/40">Toca para verla completa</span>
        </button>
      ) : (
        <p className="text-xs text-white/40">Sube la captura de la orden (subtotal, tax, total) para tener a la mano de qué fue la compra.</p>
      )}
      {grande && foto && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black/95 p-3" onClick={() => setGrande(false)}>
          <div className="mb-2 text-right text-sm text-white/70">Cerrar ✕</div>
          <img src={foto} alt="Pedido del lote" className="mx-auto w-full max-w-4xl rounded-lg" />
        </div>
      )}
    </div>
  );
}
