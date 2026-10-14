"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";

export default function TablaEditable({ cfg, tabla }) {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);   // { nuevo, datos }
  const [opciones, setOpciones] = useState({});
  const [socios, setSocios] = useState([]);
  const [msg, setMsg] = useState(null);
  const [borrar, setBorrar] = useState(false);
  const [cargando, setCargando] = useState(true);

  async function cargar() {
    let qy = sb.from(cfg.vista).select("*").order(cfg.orden, { ascending: !cfg.desc }).range(0, 4999);
    const { data, error } = await qy;
    if (error) setMsg({ ok: false, t: error.message });
    setFilas(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
    (async () => {
      const o = {};
      for (const c of cfg.campos) {
        if (c.t === "select" && !Array.isArray(c.opciones)) {
          const { tabla: t, valor, etiqueta } = c.opciones;
          const { data } = await sb.from(t).select(`${valor},${etiqueta}`).order(valor).range(0, 4999);
          o[c.k] = (data || []).map((x) => ({ v: x[valor], l: `${x[valor]} · ${x[etiqueta]}` }));
        }
      }
      setOpciones(o);
      if (cfg.campos.some((c) => c.lista === "socios")) {
        const { data } = await sb.from("productos").select("socio");
        setSocios([...new Set((data || []).map((x) => x.socio).filter(Boolean))]);
      }
    })();
  }, [tabla]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter((r) => JSON.stringify(r).toLowerCase().includes(t));
  }, [q, filas]);

  function siguienteId() {
    const max = filas.reduce((m, r) => {
      const n = parseInt(String(r[cfg.pk]).replace(/\D/g, ""), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return cfg.prefijo + String(max + 1).padStart(cfg.pad, "0");
  }

  function abrirNuevo() {
    const d = {};
    cfg.campos.forEach((c) => { d[c.k] = c.t === "number" ? "" : ""; });
    if (cfg.campos.find((c) => c.k === "estado")) d.estado = "Sin empatar";
    if (cfg.campos.find((c) => c.k === "cantidad")) d.cantidad = 1;
    d.fecha !== undefined && (d.fecha = new Date().toISOString().slice(0, 10));
    setEdit({ nuevo: true, datos: d }); setBorrar(false); setMsg(null);
  }
  function abrir(r) {
    const d = {};
    cfg.campos.forEach((c) => { d[c.k] = r[c.k] ?? ""; });
    setEdit({ nuevo: false, id: r[cfg.pk], datos: d }); setBorrar(false); setMsg(null);
  }

  function limpiar(d) {
    const o = {};
    cfg.campos.forEach((c) => {
      let v = d[c.k];
      if (v === "" || v === undefined) v = null;
      else if (c.t === "number") v = Number(v);
      o[c.k] = v;
    });
    return o;
  }

  async function guardar() {
    const falta = cfg.campos.find((c) => c.req && (edit.datos[c.k] === "" || edit.datos[c.k] == null));
    if (falta) { setMsg({ ok: false, t: `Falta: ${falta.l}` }); return; }
    const payload = limpiar(edit.datos);
    let error;
    if (edit.nuevo) ({ error } = await sb.from(tabla).insert({ [cfg.pk]: siguienteId(), ...payload }));
    else ({ error } = await sb.from(tabla).update(payload).eq(cfg.pk, edit.id));
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setEdit(null); setMsg({ ok: true, t: "Guardado" }); cargar();
  }

  async function eliminar() {
    const { error } = await sb.from(tabla).delete().eq(cfg.pk, edit.id);
    if (error) { setMsg({ ok: false, t: "No se pudo borrar: " + error.message }); setBorrar(false); return; }
    setEdit(null); setMsg({ ok: true, t: "Borrado" }); cargar();
  }

  const set = (k, v) => setEdit((e) => ({ ...e, datos: { ...e.datos, [k]: v } }));

  function derecha(r) {
    const d = cfg.derecha(r);
    const v = r[d.k];
    if (v == null) return null;
    const n = Number(v);
    return <span className={d.t === "ganancia" ? (n >= 0 ? "text-emerald-400" : "text-red-400") : "text-amber-400"}>{mxn(n)}</span>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{cfg.titulo}</h1>
        <button className="btn !py-2" onClick={abrirNuevo}>+ Nuevo</button>
      </div>
      <input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      {msg && !edit && <div className={`card text-sm ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.t}</div>}
      <p className="text-xs text-white/40">{visibles.length} registros · toca uno para editarlo</p>

      {cargando ? <p className="text-white/50">Cargando…</p> : (
        <div className="space-y-2">
          {visibles.map((r) => (
            <button key={r[cfg.pk]} onClick={() => abrir(r)} className="card flex w-full items-center justify-between gap-3 text-left active:bg-white/10">
              <span className="min-w-0">
                <span className="block truncate">{r[cfg.titulo_campo] || "(sin nombre)"}</span>
                <span className="block truncate text-xs text-white/50">{cfg.sub(r)}</span>
              </span>
              <span className="shrink-0 text-sm">{derecha(r)}</span>
            </button>
          ))}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 sm:items-center sm:justify-center" onClick={() => setEdit(null)}>
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-[#171b21] p-5 sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{edit.nuevo ? "Nuevo registro" : `Editar ${edit.id}`}</h2>
            <div className="space-y-3">
              {cfg.campos.map((c) => (
                <label key={c.k} className="block text-sm text-white/60">{c.l}{c.req && " *"}
                  {c.t === "select" ? (
                    <select className="input mt-1" value={edit.datos[c.k] ?? ""} onChange={(e) => set(c.k, e.target.value)}>
                      <option value="">—</option>
                      {(Array.isArray(c.opciones) ? c.opciones.map((o) => ({ v: o, l: o })) : opciones[c.k] || []).map((o) => (
                        <option key={o.v} value={o.v}>{o.l}</option>
                      ))}
                    </select>
                  ) : (
                    <input className="input mt-1" type={c.t === "number" ? "number" : c.t === "date" ? "date" : "text"}
                      inputMode={c.t === "number" ? "decimal" : undefined} step="any" list={c.lista ? `dl-${c.k}` : undefined}
                      value={edit.datos[c.k] ?? ""} onChange={(e) => set(c.k, e.target.value)} />
                  )}
                  {c.lista && <datalist id={`dl-${c.k}`}>{socios.map((s) => <option key={s} value={s} />)}</datalist>}
                </label>
              ))}
            </div>
            {msg && <p className="mt-3 text-sm text-red-300">{msg.t}</p>}
            <div className="mt-5 flex gap-3">
              <button className="btn flex-1" onClick={guardar}>Guardar</button>
              <button className="rounded-lg border border-white/20 px-4" onClick={() => setEdit(null)}>Cancelar</button>
            </div>
            {!edit.nuevo && (
              <div className="mt-4 border-t border-white/10 pt-4">
                {!borrar ? (
                  <button className="text-sm text-red-400" onClick={() => setBorrar(true)}>Borrar este registro</button>
                ) : (
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-red-300">¿Seguro?</span>
                    <button className="rounded-lg bg-red-600 px-3 py-2" onClick={eliminar}>Sí, borrar</button>
                    <button className="text-white/60" onClick={() => setBorrar(false)}>No</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
