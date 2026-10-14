"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setCargando(true); setError("");
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    if (error) { setError("Correo o contraseña incorrectos"); setCargando(false); return; }
    window.location.href = "/";
  }

  return (
    <form onSubmit={entrar} className="mx-auto mt-24 max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">Marinero Cards</h1>
      <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button className="btn w-full" disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
