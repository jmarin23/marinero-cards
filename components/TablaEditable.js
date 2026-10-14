"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { TABLAS } from "@/lib/tablas";
import VentaRapida from "@/components/VentaRapida";

export default function TablaEditable({ tabla }) {
  const cfg = TABLAS[tabla];
  const tablaDB = cfg.tabla || tabla;
  const [chips, setChips] = useState({});
  const sb = useMemo(() => supabaseBrowser(), []);
  const [filas, setFilas] = useState([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);   // { nuevo, datos }
  const [opciones, setOpciones] = useState({});
  const [socios, setSocios] = useState([]);
  const [msg, setMsg] = useState(null);
  const [borrar, setBorrar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [vender, setVender] = useState(null);

  async function cargar() {
    let qy = sb.from(cfg.vista).select("*").order(cfg.orden, { ascending: !cfg.desc }).range(0, 4999);
    const { data, error } = await qy;
    if (error) setMsg({ ok: false, t: error.message });
    // nombres legibles en lugar de P075 / L08
    const [pr, lo] = await Promise.all([
      sb.from("productos").select("id_producto,id_lote,nombre,socio,quien_puso_costo").range(0, 4999),
      sb.from("lotes").select("id_lote,nombre").range(0, 4999),
    ]);
    const np = Object.fromEntries((pr.data || []).map((x) => [x.id_producto, x.nombre]));
    const nl = Object.fromEntries((lo.data || []).map((x) => [x.id_lote, x.nombre]));
    const porLote = {};
    (pr.data || []).forEach((x) => { (porLote[x.id_lote] ||= []).push(x); });
    const unico = (arr) => { const u = [...new Set(arr.filter(Boolean))]; return u.length === 1 ? u[0] : ""; };
    const dec = (data || []).map((r) => {
      const ps = porLote[r.id_lote] || [];
      const pp = (pr.data || []).find((x) => x.id_producto === r.id_producto);
      const socios = [...new Set(ps.map((x) => x.socio).filter((x) => x && x !== "Yo" && x !== "—"))];
      return { ...r, _producto: np[r.id_producto] || "", _lote: nl[r.id_lote] || "",
        _socios: socios.join(", "),
        _socio: tabla === "ventas" ? pp?.socio || "" : unico(ps.map((x) => x.socio)),
        _quien: tabla === "ventas" ? pp?.quien_puso_costo || "" : unico(ps.map((x) => x.quien_puso_costo)),
        _alcance: "", _nprod: ps.length };
    });
    setFilas(cfg.filtro ? dec.filter(cfg.filtro) : dec);
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
    return filas.filter((r) =>
      Object.entries(chips).every(([k, v]) => !v || String(r[k] ?? "") === v) &&
      (!t || JSON.stringify(r).toLowerCase().includes(t)));
  }, [q, filas, chips]);
  const resumen = cfg.resumen ? cfg.resumen(visibles) : null;

  async function siguienteId() {
    const { data } = await sb.from(tablaDB).select(cfg.pk).range(0, 4999);
    const max = (data || []).reduce((m, r) => {
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
    if (cfg.campos.some((c) => c.k === "_unitario")) d._unitario = unitario(d.costo_total, d.cantidad);
    setEdit({ nuevo: false, id: r[cfg.pk], datos: d }); setBorrar(false); setMsg(null);
  }

  function limpiar(d) {
    const o = {};
    cfg.campos.filter((c) => !c.virtual).forEach((c) => {
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
    const idGuardado = edit.nuevo ? await siguienteId() : edit.id;
    if (edit.nuevo) ({ error } = await sb.from(tablaDB).insert({ [cfg.pk]: idGuardado, ...payload }));
    else ({ error } = await sb.from(tablaDB).update(payload).eq(cfg.pk, edit.id));
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    if (cfg.despues) {
      const err2 = await cfg.despues(sb, idGuardado, edit.datos);
      if (err2) { setMsg({ ok: false, t: err2 }); return; }
    }
    setEdit(null); setMsg({ ok: true, t: "Guardado" }); cargar();
  }

  async function eliminar() {
    const { error } = await sb.from(tablaDB).delete().eq(cfg.pk, edit.id);
    if (error) { setMsg({ ok: false, t: "No se pudo borrar: " + error.message }); setBorrar(false); return; }
    setEdit(null); setMsg({ ok: true, t: "Borrado" }); cargar();
  }

  function unitario(total, cant) {
    const t = Number(total), c = Number(cant);
    if (!t || !c) return "";
    return String(Math.round((t / c) * 10000) / 10000);
  }
  const set = (k, v) => setEdit((e) => {
    const d = { ...e.datos, [k]: v };
    if (cfg.campos.some((c) => c.k === "_unitario")) {
      if (k === "_unitario") {
        const t = Number(v) * Number(d.cantidad);
        d.costo_total = v === "" || !Number.isFinite(t) ? "" : String(Math.round(t * 100) / 100);
      } else if (k === "costo_total" || k === "cantidad") {
        d._unitario = unitario(d.costo_total, d.cantidad);
      }
    }
    return { ...e, datos: d };
  });

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
      {resumen && (
        <div className="grid grid-cols-2 gap-2">
          {resumen.map((x) => (
            <div key={x.l} className="card !p-3"><div className="text-[11px] uppercase tracking-wide text-white/50">{x.l}</div><div className="font-bold text-amber-400">{x.v}</div></div>
          ))}
        </div>
      )}
      {(cfg.chips || []).map((k) => {
        const vals = [...new Set(filas.map((r) => r[k]).filter(Boolean))].sort();
        return (
          <div key={k} className="flex gap-2 overflow-x-auto pb-1">
            {["", ...vals].map((v) => (
              <button key={v || "todos"} onClick={() => setChips({ ...chips, [k]: v })}
                className={`shrink-0 rounded-full border px-3 py-1 text-sm ${(chips[k] || "") === v ? "border-amber-500 bg-amber-500/20 text-amber-300" : "border-white/15 text-white/60"}`}>{v || `Todos (${k})`}</button>
            ))}
          </div>
        );
      })}
      <p className="text-xs text-white/40">{visibles.length} registros · toca uno para editarlo</p>

      {cargando ? <p className="text-white/50">Cargando…</p> : (
        <div className="space-y-2">
          {visibles.map((r) => (
            <div key={r[cfg.pk]} className="card flex w-full items-center gap-2 !p-0">
              <button onClick={() => abrir(r)} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left active:bg-white/10">
                <span className="min-w-0">
                  <span className="block truncate">{(cfg.titulo_fn ? cfg.titulo_fn(r) : r[cfg.titulo_campo]) || "(sin nombre)"}</span>
                  <span className="block truncate text-xs text-white/50">{cfg.sub(r)}</span>
                </span>
                <span className="shrink-0 text-sm">{derecha(r)}</span>
              </button>
              {cfg.vender && Number(r.inventario) > 0 && (
                <button onClick={() => setVender(r)} className="mr-3 shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black">Vender</button>
              )}
            </div>
          ))}
        </div>
      )}

      {vender && <VentaRapida prod={vender} onClose={() => setVender(null)} onSaved={(t) => { setVender(null); setMsg({ ok: true, t }); cargar(); }} />}

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
