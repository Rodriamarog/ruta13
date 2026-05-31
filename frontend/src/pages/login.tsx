import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pb } from '@/lib/pb';
import logo from '../../assets/logo.png';

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await pb.collection('users').authWithPassword(email, password);
      navigate('/');
    } catch {
      setError('Correo o contraseña incorrectos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex">

      {/* ── Left panel: logo hero ── */}
      <div className="hidden lg:block lg:w-[58%] relative overflow-hidden">

        {/* Logo image fills panel */}
        <img
          src={logo}
          alt="Ruta 13"
          className="absolute inset-0 w-full h-full object-cover object-center"
        />

        {/* Scanline texture */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.06) 3px, rgba(0,0,0,0.06) 4px)',
          }}
        />


        {/* Bottom-left tag line */}
        <div className="absolute bottom-0 left-0 right-0 z-30 p-12 pb-14">
          <div className="border-l-2 border-emerald-600 pl-5">
            <p className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.3em] mb-2">
              Sistema de gestión operativa
            </p>
            <h2 className="text-4xl font-black text-white leading-none tracking-tighter">
              ROL DE<br />TRABAJO
            </h2>
            <p className="text-zinc-500 text-xs mt-2.5 tracking-wide">
              Tijuana · Baja California · México
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel: login form ── */}
      <div className="flex-1 flex flex-col justify-center px-8 lg:px-14 bg-zinc-950">

        {/* Mobile logo */}
        <div className="lg:hidden mb-10">
          <img src={logo} alt="Ruta 13" className="w-48" />
        </div>

        <div className="w-full max-w-[340px] mx-auto">

          {/* Status pill */}
          <div className="inline-flex items-center gap-2 bg-emerald-950 border border-emerald-900/70 rounded-full px-3.5 py-1.5 mb-10">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">
              Sistema activo
            </span>
          </div>

          <h1 className="text-[22px] font-bold text-white tracking-tight mb-1">
            Acceso al sistema
          </h1>
          <p className="text-sm text-zinc-500 mb-8">
            Ingresa tus credenciales para continuar
          </p>

          <form onSubmit={submit} className="space-y-4">

            {error && (
              <div className="flex items-start gap-3 bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3">
                <div className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <p className="text-sm text-red-300 leading-snug">{error}</p>
              </div>
            )}

            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Correo electrónico
              </label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@ruta13.local"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-150 hover:border-zinc-700 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/40"
              />
            </div>

            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Contraseña
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none transition-all duration-150 hover:border-zinc-700 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700/40"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2.5 rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold tracking-wide text-white transition-colors duration-150 hover:bg-emerald-600 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin text-white/60"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verificando...
                </>
              ) : (
                'Entrar'
              )}
            </button>

          </form>

          {/* Footer */}
          <div className="mt-16 border-t border-zinc-900 pt-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              Ruta 13 · Corredor Aguacaliente
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-700">
              Tijuana, Baja California
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
