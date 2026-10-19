"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mxn } from "@/lib/format";
import { useRefrescar } from "@/lib/useRefrescar";

const n = (x) => Number(x || 0);
const hoy = () => new Date().toISOString().slice(0, 10);
const norm = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Coleccion() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [vista, setVista] = useState("cartas");
  const [cartas, setCartas] = useState([]);
  const [compras, setCompras] = useState([]);
  const [falta, setFalta] = useState(false); // aún no corren el SQL
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState("Disponibles");
  const [abierta, setAbierta] = useState(null); // id de la fila con el formulario abierto
  const [precio, setPrecio] = useState("");
  const [fecha, setFecha] = useState(hoy());
  const [msg, setMsg] = useState(null);

  async function cargar() {
    const [c, k] = await Promise.all([
      sb.from("cartas").select("*").order("id_carta").range(0, 4999),
      sb.from("coleccion").select("*").order("id_compra").range(0, 4999),
    ]);
    if (c.error) return setMsg(c.error.message);
    setCartas(c.data || []);
    if (k.error) { setFalta(true); setCompras([]); } else { setFalta(false); setCompras(k.data || []); }
  }
  useEffect(() => { try { const v = localStorage.getItem("vistaColeccion"); if (v) setVista(v); } catch {} cargar(); }, []);
  useRefrescar(cargar);
  const cambiarVista = (v) => { setVista(v); try { localStorage.setItem("vistaColeccion", v); } catch {} };

  const vendida = (c) => n(c.valor_venta) > 0;
  const costoCartas = cartas.filter((c) => !c.id_compra).reduce((t, c) => t + n(c.costo), 0); // las que tienen compra ya cuentan en la compra
  const gastado = compras.reduce((t, c) => t + n(c.monto), 0) + costoCartas;
  const recuperado = compras.reduce((t, c) => t + n(c.vendido), 0) + cartas.reduce((t, c) => t + (vendida(c) ? n(c.valor_venta) : 0), 0);
  const nVend = cartas.filter(vendida).length;
  const valorDisp = cartas.filter((c) => !vendida(c)).reduce((t, c) => t + n(c.valoracion), 0);

  const lista = useMemo(() => {
    const pal = norm(q).split(/\s+/).filter(Boolean);
    return cartas.filter((c) => {
      if (filtro === "Disponibles" && vendida(c)) return false;
      if (filtro === "Vendidas" && !vendida(c)) return false;
      const h = norm(`${c.nombre} ${c.deporte || ""} ${c.id_carta}`);
      return pal.every((w) => h.includes(w));
    });
  }, [cartas, q, filtro]);

  function abrir(id, sugerido) { setAbierta(id); setPrecio(sugerido ? String(sugerido) : ""); setFecha(hoy()); setMsg(null); }

  async function venderCarta(c) {
    const p = Number(precio);
    if (!(p > 0)) return setMsg("Escribe en cuánto la vendiste");
    const { error } = await sb.from("cartas").update({ valor_venta: p, fecha_venta: fecha || null }).eq("id_carta", c.id_carta);
    if (error) return setMsg(error.message.includes("fecha_venta") ? "Falta correr supabase/coleccion.sql en Supabase" : error.message);
    setAbierta(null); cargar();
  }
  async function deshacerCarta(c) {
    if (!confirm(`¿Quitar la venta de ${c.nombre}?`)) return;
    const { error } = await sb.from("cartas").update({ valor_venta: 0, fecha_venta: null }).eq("id_carta", c.id_carta);
    if (error) setMsg(error.message); else cargar();
  }
  async function venderDeCompra(k) {
    const p = Number(precio);
    if (!(p > 0)) return setMsg("Escribe cuánto vendiste");
    const { error } = await sb.from("coleccion").update({ vendido: n(k.vendido) + p }).eq("id_compra", k.id_compra);
    if (error) return setMsg(error.message);
    setAbierta(null); cargar();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Colección</h1>
        <Link href={vista === "cartas" ? "/datos/cartas" : "/datos/coleccion"} className="text-sm text-amber-400">Agregar / editar →</Link>
      </div>
      <p className="-mt-2 text-xs text-white/40">Tus compras de aficionado y tus cartas. No mezcla con la ganancia de reventa ni con Socios.</p>

      {falta && (
        <div className="card border-amber-500/40 text-sm text-amber-300">
          Falta crear la tabla de compras de colección. Corre <b>supabase/coleccion.sql</b> en Supabase (SQL Editor) y vuelve a abrir esta pantalla.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="card"><div className="text-xs uppercase text-white/50">Gastado</div><div className="mt-1 text-xl font-bold text-amber-400">{mxn(gastado)}</div></div>
        <div className="card"><div className="text-xs uppercase text-white/50">Recuperado</div><div className="mt-1 text-xl font-bold text-emerald-400">{mxn(recuperado)}</div></div>
        <div className="card"><div className="text-xs uppercase text-white/50">Cartas vendidas</div><div className="mt-1 text-xl font-bold">{nVend} de {cartas.length}</div></div>
        <div className="card"><div className="text-xs uppercase text-white/50">Valor de las que quedan</div><div className="mt-1 text-xl font-bold">{mxn(valorDisp)}</div></div>
      </div>

      <div className="flex gap-2 text-sm">
        {[["cartas", "Cartas"], ["compras", "Compras"]].map(([v, l]) => (
          <button key={v} onClick={() => cambiarVista(v)} className={`flex-1 rounded-lg border px-3 py-2 ${vista === v ? "border-amber-500 text-amber-300" : "border-white/10 text-white/60"}`}>{l}</button>
        ))}
      </div>

      {msg && <div className="card text-sm text-red-300">{msg}</div>}

      {vista === "cartas" ? (
        <>
          <input className="input" placeholder="Buscar carta…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="flex gap-2 text-xs">
            {["Disponibles", "Vendidas", "Todas"].map((f) => (
              <button key={f} onClick={() => setFiltro(f)} className={`rounded-full border px-3 py-1 ${filtro === f ? "border-amber-500 text-amber-300" : "border-white/10 text-white/60"}`}>{f}</button>
            ))}
            <span className="ml-auto self-center text-white/40">{lista.length}</span>
          </div>
          <div className="space-y-2">
            {lista.map((c) => {
              const v = vendida(c);
              const gan = n(c.costo) > 0 ? n(c.valor_venta) - n(c.costo) : null;
              return (
                <div key={c.id_carta} className="card text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div>{c.nombre}</div>
                      <div className="text-xs text-white/50">
                        {c.id_carta}{c.deporte ? ` · ${c.deporte}` : ""}{n(c.costo) > 0 ? ` · pagué ${mxn(c.costo)}` : ""}{n(c.valoracion) > 0 ? ` · vale ${mxn(c.valoracion)}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {v ? (<>
                        <div className="text-emerald-400">Vendida {mxn(c.valor_venta)}</div>
                        <div className="text-xs text-white/50">{c.fecha_venta || "sin fecha"}{gan != null ? ` · ${gan >= 0 ? "+" : ""}${mxn(gan)}` : ""}</div>
                      </>) : <div className="text-white/60">{mxn(c.valoracion)}</div>}
                    </div>
                  </div>
                  {abierta === c.id_carta ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input className="input !py-2" type="number" inputMode="decimal" placeholder="Vendida en $" autoFocus value={precio} onChange={(e) => setPrecio(e.target.value)} />
                      <input className="input !py-2" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                      <button className="rounded-lg border border-amber-500/60 py-2 text-amber-300" onClick={() => venderCarta(c)}>Guardar venta</button>
                      <button className="rounded-lg border border-white/10 py-2 text-white/60" onClick={() => setAbierta(null)}>Cancelar</button>
                    </div>
                  ) : (
                    <div className="mt-1 flex gap-4 text-xs">
                      {v ? <button className="text-red-400 underline" onClick={() => deshacerCarta(c)}>Quitar venta</button>
                         : <button className="text-amber-300 underline" onClick={() => abrir(c.id_carta, n(c.valoracion))}>Marcar vendida</button>}
                      <Link href="/datos/cartas" className="text-white/40 underline">Editar</Link>
                    </div>
                  )}
                </div>
              );
            })}
            {!lista.length && <div className="card text-sm text-white/50">Nada con ese filtro.</div>}
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {compras.map((k) => {
            const cs = cartas.filter((c) => c.id_compra === k.id_compra);
            const rec = n(k.vendido) + cs.reduce((t, c) => t + (vendida(c) ? n(c.valor_venta) : 0), 0);
            const dif = rec - n(k.monto);
            return (
              <div key={k.id_compra} className="card text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div>{k.descripcion}</div>
                    <div className="text-xs text-white/50">{k.id_compra}{k.fecha ? ` · ${k.fecha}` : ""}{k.notas ? ` · ${k.notas}` : ""}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div>{mxn(k.monto)}</div>
                    <div className={`text-xs ${dif >= 0 ? "text-emerald-400" : "text-white/50"}`}>
                      {rec > 0 ? `recuperado ${mxn(rec)}${dif >= 0 ? " · ya salió" : ""}` : "sin ventas"}
                    </div>
                  </div>
                </div>
                {abierta === k.id_compra ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input className="input !py-2" type="number" inputMode="decimal" placeholder="Vendí $" autoFocus value={precio} onChange={(e) => setPrecio(e.target.value)} />
                    <button className="rounded-lg border border-amber-500/60 py-2 text-amber-300" onClick={() => venderDeCompra(k)}>Sumar venta</button>
                  </div>
                ) : (
                  <div className="mt-1 flex gap-4 text-xs">
                    <button className="text-amber-300 underline" onClick={() => abrir(k.id_compra, "")}>Registrar venta</button>
                    <Link href="/datos/coleccion" className="text-white/40 underline">Editar</Link>
                  </div>
                )}
              </div>
            );
          })}
          {!compras.length && !falta && <div className="card text-sm text-white/50">Aún no hay compras de colección.</div>}
        </div>
      )}
    </div>
  );
}
