"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { comprimirImagen, imagenDePegado, imagenDelPortapapeles, leerFotos, guardarFotosTxt, MAX_FOTOS } from "@/lib/foto";

const SQL = "alter table lotes add column if not exists foto text;";

// Fotos del pedido de un lote (la captura de la orden con subtotal, tax y total; hasta 6). Se guardan en lotes.foto.
export default function FotoLote({ idLote }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [fotos, setFotos] = useState([]);
  const fotosRef = useRef([]);
  const [cargando, setCargando] = useState(true);
  const [falta, setFalta] = useState(false);
  const [err, setErr] = useState("");
  const [grande, setGrande] = useState(null); // índice de la foto abierta
  const [ocupado, setOcupado] = useState(false);

  const poner = (a) => { fotosRef.current = a; setFotos(a); };
  async function cargar() {
    const { data, error } = await sb.from("lotes").select("foto").eq("id_lote", idLote).maybeSingle();
    if (error) { setFalta(true); poner([]); } else { setFalta(false); poner(leerFotos(data?.foto)); }
    setCargando(false);
  }
  useEffect(() => { setCargando(true); cargar(); }, [idLote]);

  async function guardar(nuevas) {
    setOcupado(true); setErr("");
    const { error } = await sb.from("lotes").update({ foto: guardarFotosTxt(nuevas) }).eq("id_lote", idLote);
    setOcupado(false);
    if (error) return setErr(error.message);
    poner(nuevas);
  }
  async function agregar(archivos) {
    const lista = [...archivos];
    if (!lista.length) return;
    setErr("");
    let nuevas = [...fotosRef.current];
    try {
      for (const f of lista) {
        if (nuevas.length >= MAX_FOTOS) { setErr(`Máximo ${MAX_FOTOS} fotos por lote`); break; }
        nuevas.push(await comprimirImagen(f));
      }
      await guardar(nuevas);
    } catch (x) { setErr(x.message); }
  }
  async function pegarBoton() {
    setErr("");
    try { agregar([await imagenDelPortapapeles()]); } catch (x) { setErr(x.message); }
  }
  // Cmd/Ctrl + V en cualquier parte de la pantalla: si lo copiado es una imagen, se suma a las fotos del lote
  useEffect(() => {
    const alPegar = (e) => { const f = imagenDePegado(e); if (f) { e.preventDefault(); agregar([f]); } };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [idLote]);

  if (cargando) return null;
  if (falta) {
    return (
      <div className="card space-y-2 border-amber-500/40 text-sm text-amber-300">
        <p>Para guardar la foto del pedido corre esto una vez en Supabase (SQL Editor) y vuelve a abrir:</p>
        <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-white/80">{SQL}</pre>
      </div>
    );
  }
  const quitar = (i) => { if (confirm("¿Quitar esta foto?")) guardar(fotos.filter((_, j) => j !== i)); };
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-white/70">Fotos del pedido {fotos.length > 0 && <span className="text-white/40">({fotos.length}/{MAX_FOTOS})</span>}</span>
        <span className="flex gap-4 text-xs">
          <button className="text-amber-300" disabled={ocupado || fotos.length >= MAX_FOTOS} onClick={pegarBoton}>📋 Pegar</button>
          <label className="cursor-pointer text-amber-300">
            ＋ Agregar
            <input type="file" accept="image/*" multiple className="hidden" disabled={ocupado || fotos.length >= MAX_FOTOS}
              onChange={(e) => { const l = [...(e.target.files || [])]; e.target.value = ""; agregar(l); }} />
          </label>
        </span>
      </div>
      {ocupado && <p className="text-xs text-white/50">Guardando…</p>}
      {err && <p className="text-xs text-red-300">{err}</p>}
      {fotos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.map((f, i) => (
            <div key={i} className="relative">
              <button className="block w-full" onClick={() => setGrande(i)}>
                <img src={f} alt={`Pedido del lote ${i + 1}`} className="h-40 w-full rounded-lg object-cover object-top" />
              </button>
              <button className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-red-300" disabled={ocupado} onClick={() => quitar(i)}>Quitar</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/40">Copia la captura de la orden (subtotal, tax, total) y pégala aquí con Cmd/Ctrl + V o con el botón Pegar. Puedes subir varias.</p>
      )}
      {fotos.length > 0 && <p className="text-xs text-white/40">Toca una para verla completa</p>}
      {grande != null && fotos[grande] && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black/95 p-3" onClick={() => setGrande(null)}>
          <div className="mb-2 flex items-center justify-between text-sm text-white/70">
            <span className="flex gap-4" onClick={(e) => e.stopPropagation()}>
              {fotos.length > 1 && <button onClick={() => setGrande((grande - 1 + fotos.length) % fotos.length)}>← Anterior</button>}
              {fotos.length > 1 && <button onClick={() => setGrande((grande + 1) % fotos.length)}>Siguiente →</button>}
              <span className="text-white/40">{grande + 1} de {fotos.length}</span>
            </span>
            <span>Cerrar ✕</span>
          </div>
          <img src={fotos[grande]} alt="Pedido del lote" className="mx-auto w-full max-w-4xl rounded-lg" />
        </div>
      )}
    </div>
  );
}
