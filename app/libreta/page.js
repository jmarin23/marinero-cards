"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import Combo from "@/components/Combo";
import { useRefrescar } from "@/lib/useRefrescar";

const n = (x) => Number(String(x ?? "").replace(/[$,\s]/g, "")) || 0;
const r2 = (x) => Math.round(x * 100) / 100;
const norm = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const hoy = () => new Date().toLocaleDateString("en-CA"); // yyyy-mm-dd en hora local
const corta = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "s/f");
const txt = (v) => (v === "" || v == null ? "" : String(r2(Number(v))));
const SQL = `create table if not exists libreta (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  producto text not null,
  cliente text,
  cantidad numeric not null default 1,
  monto numeric not null default 0,
  id_producto text,
  pasada_a text,
  notas text,
  creado_en timestamptz default now()
);
alter table libreta enable row level security;
drop policy if exists "auth_all" on libreta;
create policy "auth_all" on libreta for all to authenticated using (true) with check (true);`;

const vacio = (fecha) => ({ producto: "", cliente: "", cantidad: "1", cu: "", total: "", fecha: fecha || hoy(), id_producto: "" });

// Fecha de una línea pegada: dd/mm, dd/mm/aaaa o aaaa-mm-dd
function fechaDe(s) {
  const t = String(s || "").trim();
  if (!t) return hoy();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3]) : String(new Date().getFullYear());
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

// Cantidad, precio por pieza y total se mueven juntos: tocas uno y se recalculan los demás
function conTotales(f, campo, v) {
  const g = { ...f, [campo]: v };
  const c = n(g.cantidad);
  if (campo === "cantidad") { if (g.cu !== "") g.total = txt(n(g.cu) * c); else if (g.total !== "" && c > 0) g.cu = txt(n(g.total) / c); }
  if (campo === "cu") g.total = v === "" ? "" : txt(n(v) * c);
  if (campo === "total") g.cu = v === "" || c <= 0 ? "" : txt(n(v) / c);
  return g;
}

export default function Libreta() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [filas, setFilas] = useState([]);
  const [prods, setProds] = useState([]);
  const [falta, setFalta] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState(vacio());
  const [msg, setMsg] = useState(null);
  const [filtro, setFiltro] = useState("pendientes");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(new Set());
  const [editId, setEditId] = useState(null);
  const [ed, setEd] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [pegado, setPegado] = useState("");
  const refProducto = useRef(null);

  async function cargar() {
    const [l, p] = await Promise.all([
      sb.from("libreta").select("*").order("fecha", { ascending: false }).order("id", { ascending: false }).range(0, 4999),
      sb.from("v_productos").select("id_producto,id_lote,nombre,inventario").gt("inventario", 0).neq("categoria", "Costo extra").order("nombre").range(0, 4999),
    ]);
    if (l.error) { setFalta(true); setFilas([]); } else { setFalta(false); setFilas(l.data || []); }
    setProds(p.data || []);
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);
  useRefrescar(() => { if (!editId) cargar(); });

  const prodPorId = useMemo(() => Object.fromEntries(prods.map((p) => [p.id_producto, p])), [prods]);
  const opcionesProd = useMemo(() => prods.map((p) => ({ v: p.id_producto, l: `${p.nombre} · quedan ${Number(p.inventario)}` })), [prods]);

  // productos usados antes: para tocarlos en lugar de volver a escribirlos (y traer su último precio por pieza)
  const recientes = useMemo(() => {
    const vistos = new Map();
    for (const r of filas) {
      const k = norm(r.producto);
      if (!vistos.has(k)) vistos.set(k, { nombre: r.producto, cu: n(r.cantidad) > 0 ? n(r.monto) / n(r.cantidad) : 0, id_producto: r.id_producto || "" });
    }
    return [...vistos.values()].slice(0, 10);
  }, [filas]);

  const vista = useMemo(() => {
    const pal = norm(q).split(/\s+/).filter(Boolean);
    return filas.filter((r) => {
      if (filtro === "pendientes" && r.pasada_a) return false;
      if (filtro === "pasadas" && !r.pasada_a) return false;
      const h = norm(`${r.producto} ${r.cliente || ""}`);
      return pal.every((w) => h.includes(w));
    });
  }, [filas, filtro, q]);

  // totales por producto (de lo que se ve): piezas, dinero y promedio por pieza
  const porProducto = useMemo(() => {
    const m = new Map();
    for (const r of vista) {
      const k = norm(r.producto);
      if (!m.has(k)) m.set(k, { k, nombre: r.producto, piezas: 0, monto: 0, ventas: 0 });
      const t = m.get(k);
      t.piezas += n(r.cantidad); t.monto += n(r.monto); t.ventas += 1;
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  }, [vista]);
  const totalVista = vista.reduce((t, r) => ({ piezas: t.piezas + n(r.cantidad), monto: t.monto + n(r.monto) }), { piezas: 0, monto: 0 });

  const porDia = useMemo(() => {
    const m = new Map();
    for (const r of vista) { const k = r.fecha || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return [...m.entries()];
  }, [vista]);

  async function agregar() {
    setMsg(null);
    const producto = f.producto.trim();
    const monto = f.total !== "" ? n(f.total) : n(f.cu) * n(f.cantidad);
    if (!producto) return setMsg({ ok: false, t: "Falta el producto" });
    if (!(n(f.cantidad) > 0)) return setMsg({ ok: false, t: "La cantidad tiene que ser mayor a 0" });
    if (!(monto > 0)) return setMsg({ ok: false, t: "Falta el monto (total o precio por pieza)" });
    setOcupado(true);
    const { error } = await sb.from("libreta").insert({ fecha: f.fecha || hoy(), producto, cliente: f.cliente.trim() || null, cantidad: n(f.cantidad), monto: r2(monto), id_producto: f.id_producto || null });
    setOcupado(false);
    if (error) return setMsg({ ok: false, t: error.message });
    setF(vacio(f.fecha));
    refProducto.current?.focus();
    cargar();
  }
  const enter = (e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } };

  async function guardarEdicion() {
    const monto = ed.total !== "" ? n(ed.total) : n(ed.cu) * n(ed.cantidad);
    if (!ed.producto.trim() || !(n(ed.cantidad) > 0) || !(monto > 0)) return setMsg({ ok: false, t: "Revisa producto, cantidad y monto" });
    setOcupado(true);
    const { error } = await sb.from("libreta").update({ fecha: ed.fecha || hoy(), producto: ed.producto.trim(), cliente: ed.cliente.trim() || null, cantidad: n(ed.cantidad), monto: r2(monto), id_producto: ed.id_producto || null }).eq("id", editId);
    setOcupado(false);
    if (error) return setMsg({ ok: false, t: error.message });
    setEditId(null); setEd(null); cargar();
  }
  async function borrar(r) {
    if (!confirm(`¿Borrar "${r.producto}"${r.cliente ? " de " + r.cliente : ""} por ${mxn(r.monto)}?`)) return;
    const { error } = await sb.from("libreta").delete().eq("id", r.id);
    if (error) setMsg({ ok: false, t: error.message }); else { setEditId(null); setEd(null); setSel((s) => { const x = new Set(s); x.delete(r.id); return x; }); cargar(); }
  }
  function abrirEdicion(r) {
    setEditId(r.id);
    setEd({ producto: r.producto, cliente: r.cliente || "", cantidad: txt(r.cantidad), cu: txt(n(r.cantidad) > 0 ? n(r.monto) / n(r.cantidad) : ""), total: txt(r.monto), fecha: r.fecha || hoy(), id_producto: r.id_producto || "" });
  }

  // ---- pegar varias líneas: producto ; cliente ; cantidad ; monto total ; fecha (opcional) ----
  const lineas = useMemo(() => pegado.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const sep = l.includes("\t") ? "\t" : l.includes(";") ? ";" : l.includes("|") ? "|" : ",";
    const c = l.split(sep).map((x) => x.trim());
    const fecha = fechaDe(c[4]);
    const ok = c[0] && n(c[2]) > 0 && n(c[3]) > 0 && fecha;
    return { texto: l, producto: c[0] || "", cliente: c[1] || "", cantidad: n(c[2]), monto: n(c[3]), fecha, ok: !!ok };
  }), [pegado]);
  async function importar() {
    const buenas = lineas.filter((l) => l.ok);
    if (!buenas.length) return setMsg({ ok: false, t: "No hay líneas válidas" });
    setOcupado(true); setMsg(null);
    const { error } = await sb.from("libreta").insert(buenas.map((l) => ({ fecha: l.fecha, producto: l.producto, cliente: l.cliente || null, cantidad: l.cantidad, monto: r2(l.monto) })));
    setOcupado(false);
    if (error) return setMsg({ ok: false, t: error.message });
    setPegado(""); setMsg({ ok: true, t: `Se agregaron ${buenas.length} línea(s)` + (buenas.length < lineas.length ? `; ${lineas.length - buenas.length} no se pudieron leer` : "") });
    cargar();
  }

  // ---- pasar a Ventas ----
  const porPasar = filas.filter((r) => sel.has(r.id) && !r.pasada_a);
  async function pasar() {
    if (!porPasar.length) return;
    setOcupado(true); setMsg(null);
    const { data: ult } = await sb.from("ventas").select("id_venta").like("id_venta", "V%").order("id_venta", { ascending: false }).limit(1);
    let num = ult?.[0] ? parseInt(ult[0].id_venta.slice(1), 10) || 0 : 0;
    let hechas = 0;
    for (const r of [...porPasar].sort((a, b) => a.id - b.id)) {
      num += 1;
      const id = "V" + String(num).padStart(4, "0");
      const p = r.id_producto ? prodPorId[r.id_producto] : null;
      const { error } = await sb.from("ventas").insert({
        id_venta: id, fecha: r.fecha || null, id_producto: p ? p.id_producto : null, id_lote: p ? p.id_lote : null,
        canal: "Externa", cantidad: n(r.cantidad), monto_neto: n(r.monto), estado: "Pagado",
        cliente_notas: p ? (r.cliente || null) : `${r.producto} | ${r.cliente || "sin cliente"}`,
      });
      if (error) { setOcupado(false); cargar(); return setMsg({ ok: false, t: `Se pasaron ${hechas}; falló "${r.producto}": ${error.message}` }); }
      await sb.from("libreta").update({ pasada_a: id }).eq("id", r.id);
      hechas += 1;
    }
    setOcupado(false); setSel(new Set());
    setMsg({ ok: true, t: `${hechas} venta(s) pasadas a Ventas (canal Externa, Pagado)` });
    cargar();
  }

  const alternar = (id) => setSel((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const campos = (g, set, conEnter) => (
    <div className="space-y-2">
      <input ref={conEnter ? refProducto : null} className="input" placeholder="Producto (ej. Sobres Pitch Black)" value={g.producto} onChange={(e) => set({ ...g, producto: e.target.value })} onKeyDown={conEnter ? enter : undefined} />
      <input className="input" placeholder="Cliente" value={g.cliente} onChange={(e) => set({ ...g, cliente: e.target.value })} onKeyDown={conEnter ? enter : undefined} />
      <div className="grid grid-cols-3 gap-2">
        <label className="text-xs text-white/50">Cantidad
          <input className="input mt-1" type="number" inputMode="decimal" value={g.cantidad} onChange={(e) => set(conTotales(g, "cantidad", e.target.value))} onKeyDown={conEnter ? enter : undefined} />
        </label>
        <label className="text-xs text-white/50">$ por pieza
          <input className="input mt-1" type="number" inputMode="decimal" value={g.cu} onChange={(e) => set(conTotales(g, "cu", e.target.value))} onKeyDown={conEnter ? enter : undefined} />
        </label>
        <label className="text-xs text-white/50">$ total
          <input className="input mt-1" type="number" inputMode="decimal" value={g.total} onChange={(e) => set(conTotales(g, "total", e.target.value))} onKeyDown={conEnter ? enter : undefined} />
        </label>
      </div>
      <label className="block text-xs text-white/50">Fecha
        <input className="input mt-1" type="date" value={g.fecha} onChange={(e) => set({ ...g, fecha: e.target.value })} />
      </label>
      <details className="text-xs" open={!!g.id_producto}>
        <summary className="cursor-pointer text-white/50">Ligar a un producto del inventario (opcional, para que descuente)</summary>
        <Combo value={g.id_producto} onChange={(v) => set({ ...g, id_producto: v })} options={opcionesProd} vacio="— sin ligar (venta suelta) —" placeholder="Busca el producto…" />
      </details>
    </div>
  );

  if (cargando) return <p className="text-sm text-white/50">Cargando…</p>;
  if (falta) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Libreta</h1>
        <div className="card space-y-2 border-amber-500/40 text-sm text-amber-300">
          <p>Falta crear la tabla de la libreta. Pega esto en Supabase (SQL Editor), córrelo una vez y vuelve a abrir esta pantalla:</p>
          <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-white/80">{SQL}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Libreta</h1>
        <Link href="/ventas/nueva" className="text-sm text-amber-400">Vender →</Link>
      </div>
      <p className="-mt-2 text-xs text-white/40">Apunta aquí tus ventas por fuera, rápido y sin inventario. Cuando quieras, las pasas a Ventas.</p>
      {msg && <div className={`card text-sm ${msg.ok ? "border-emerald-500/40 text-emerald-300" : "border-red-500/40 text-red-300"}`}>{msg.t}</div>}

      <section className="card space-y-3">
        <div className="text-sm text-white/60">Nueva línea</div>
        {recientes.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recientes.map((r) => (
              <button key={r.nombre} className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs text-white/70"
                onClick={() => setF(conTotales({ ...f, producto: r.nombre, id_producto: r.id_producto }, "cu", r.cu ? txt(r.cu) : ""))}>{r.nombre}</button>
            ))}
          </div>
        )}
        {campos(f, setF, true)}
        <button className="btn w-full" disabled={ocupado} onClick={agregar}>Agregar a la libreta</button>
      </section>

      <details className="card text-sm">
        <summary className="cursor-pointer text-amber-300">Pegar varias líneas (vaciar el cuaderno)</summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-white/50">Una venta por línea, separada por coma, punto y coma o tab: <b>producto, cliente, cantidad, monto total, fecha</b> (la fecha es opcional; sin fecha usa hoy).</p>
          <textarea className="input min-h-[8rem] font-mono text-xs" placeholder={"Sobres Pitch Black, Juan, 5, 300, 28/10\nETB Leo, Ana, 1, 1800"} value={pegado} onChange={(e) => setPegado(e.target.value)} />
          {lineas.length > 0 && (
            <div className="space-y-1 text-xs">
              {lineas.map((l, i) => (
                <div key={i} className={`flex justify-between gap-3 ${l.ok ? "text-white/60" : "text-red-300"}`}>
                  <span className="min-w-0 truncate">{l.ok ? `${l.producto}${l.cliente ? " · " + l.cliente : ""} · ${l.cantidad} pza${l.cantidad === 1 ? "" : "s"} · ${corta(l.fecha)}` : `No se entiende: ${l.texto}`}</span>
                  {l.ok && <span className="shrink-0">{mxn(l.monto)}</span>}
                </div>
              ))}
            </div>
          )}
          <button className="btn w-full" disabled={ocupado || !lineas.some((l) => l.ok)} onClick={importar}>Agregar {lineas.filter((l) => l.ok).length || ""} línea(s)</button>
        </div>
      </details>

      <div className="flex gap-2 text-xs">
        {[["pendientes", "Por pasar"], ["pasadas", "Ya pasadas"], ["todas", "Todas"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} className={`rounded-full border px-3 py-1 ${filtro === v ? "border-amber-500 text-amber-300" : "border-white/10 text-white/60"}`}>{l}</button>
        ))}
        <span className="ml-auto self-center text-white/40">{vista.length}</span>
      </div>
      <input className="input" placeholder="Buscar producto o cliente…" value={q} onChange={(e) => setQ(e.target.value)} />

      {vista.length > 0 && (
        <section className="card space-y-1 text-sm">
          <div className="mb-1 text-xs uppercase text-white/50">Totales por producto {q ? `(filtrado: "${q}")` : ""}</div>
          {porProducto.map((t) => (
            <button key={t.k} className="flex w-full items-baseline justify-between gap-3 text-left" onClick={() => setQ(t.nombre)}>
              <span className="min-w-0 truncate text-white/80">{t.nombre}</span>
              <span className="shrink-0 text-right">
                <b>{mxn(t.monto)}</b>
                <span className="block text-xs text-white/50">{t.piezas.toLocaleString("es-MX")} pzas · {mxn(t.monto / (t.piezas || 1))} c/u</span>
              </span>
            </button>
          ))}
          {porProducto.length > 1 && (
            <div className="flex justify-between border-t border-white/10 pt-1 font-semibold"><span>Total</span><span>{mxn(totalVista.monto)} · {totalVista.piezas.toLocaleString("es-MX")} pzas</span></div>
          )}
          {q && <button className="pt-1 text-xs text-amber-300 underline" onClick={() => setQ("")}>Quitar filtro</button>}
        </section>
      )}

      <section className="space-y-3">
        {porDia.map(([dia, rs]) => (
          <div key={dia} className="space-y-2">
            <div className="flex justify-between text-xs text-white/50"><span>{dia ? dia.split("-").reverse().join("/") : "Sin fecha"}</span><span>{mxn(rs.reduce((t, r) => t + n(r.monto), 0))}</span></div>
            {rs.map((r) => (
              <div key={r.id} className="card !p-3 text-sm">
                {editId === r.id && ed ? (
                  <div className="space-y-3">
                    {campos(ed, setEd, false)}
                    <div className="flex gap-2">
                      <button className="btn flex-1 !py-2" disabled={ocupado} onClick={guardarEdicion}>Guardar</button>
                      <button className="rounded-lg border border-white/20 px-4 text-sm" onClick={() => { setEditId(null); setEd(null); }}>Cancelar</button>
                      <button className="rounded-lg border border-red-500/50 px-3 text-sm text-red-300" onClick={() => borrar(r)}>Borrar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    {!r.pasada_a && <input type="checkbox" className="mt-1" checked={sel.has(r.id)} onChange={() => alternar(r.id)} />}
                    <button className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left" onClick={() => abrirEdicion(r)}>
                      <span className="min-w-0">
                        <span className="block truncate">{r.producto}</span>
                        <span className="block text-xs text-white/50">
                          {r.cliente || "sin cliente"} · {n(r.cantidad)} × {mxn(n(r.monto) / (n(r.cantidad) || 1))}
                          {r.id_producto && prodPorId[r.id_producto] ? " · ligado" : ""}
                          {r.pasada_a ? <span className="text-emerald-400"> · pasada a {r.pasada_a}</span> : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-amber-400">{mxn(r.monto)}</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {vista.length === 0 && <p className="text-sm text-white/50">{filas.length ? "Nada con ese filtro." : "Aún no hay nada apuntado. Agrega tu primera línea arriba."}</p>}
      </section>

      {porPasar.length > 0 && (
        <div className="fixed inset-x-0 bottom-14 z-30 mx-auto max-w-3xl px-4">
          <button className="btn w-full shadow-lg" disabled={ocupado} onClick={pasar}>
            Pasar {porPasar.length} a Ventas · {mxn(porPasar.reduce((t, r) => t + n(r.monto), 0))}
          </button>
        </div>
      )}
    </div>
  );
}
