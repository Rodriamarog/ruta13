import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Archive, Bus, CalendarDays, LayoutDashboard, LogOut, Settings, Users } from 'lucide-react';
import { Toaster } from 'sonner';
import logo from '../assets/logo.png';
import './styles.css';
import { pb } from './lib/pb';
import { cn } from './lib/utils';
import type { AuthUser } from './types/pocketbase';
import { Button } from './components/ui/button';
import { Login } from './pages/login';
import { Dashboard } from './pages/dashboard';
import { Drivers } from './pages/drivers';
import { Units } from './pages/units';
import { Roster } from './pages/roster';
import { History } from './pages/history';
import { SettingsPage } from './pages/settings';

const nav = [
  { to: '/', label: 'Panel', icon: LayoutDashboard },
  { to: '/conductores', label: 'Conductores', icon: Users },
  { to: '/unidades', label: 'Unidades', icon: Bus },
  { to: '/rol', label: 'Rol', icon: CalendarDays },
  { to: '/historial', label: 'Historial', icon: Archive },
  { to: '/configuracion', label: 'Configuración', icon: Settings },
] as const;

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm text-zinc-400 transition-colors hover:bg-white/10 hover:text-white',
          isActive && 'bg-white/15 text-white',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );
}

function Shell({ user }: { user: AuthUser }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 md:h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b border-zinc-800 bg-zinc-950 p-4 text-white md:h-full md:overflow-y-auto md:border-b-0 md:border-r">
        <div className="-mx-4 -mt-4 mb-5 h-20 overflow-hidden">
          <img src={logo} alt="Ruta 13" className="w-full h-full object-cover object-center" />
        </div>

        <nav className="flex gap-1 overflow-x-auto md:grid md:overflow-visible">
          {nav.map(({ to, label, icon }) => (
            <NavItem key={to} to={to} icon={icon} label={label} />
          ))}
        </nav>

        <div className="mt-6 hidden border-t border-white/10 pt-4 md:grid md:gap-2">
          <div className="truncate text-xs text-zinc-500">{user.email}</div>
          <Button
            variant="ghost"
            className="justify-start text-zinc-400 hover:bg-white/10 hover:text-white"
            onClick={() => { pb.authStore.clear(); navigate('/login'); }}
          >
            <LogOut className="h-4 w-4" />Salir
          </Button>
        </div>
      </aside>

      <main className="p-4 md:h-full md:overflow-hidden md:flex md:flex-col md:p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/conductores" element={<Drivers />} />
          <Route path="/unidades" element={<Units />} />
          <Route path="/rol" element={<Roster />} />
          <Route path="/historial" element={<History />} />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<AuthUser | null>(pb.authStore.record as AuthUser | null);
  useEffect(() => pb.authStore.onChange(() => setUser(pb.authStore.record as AuthUser | null)), []);
  return (
    <BrowserRouter>
      <Toaster richColors position="top-right" />
      {user ? (
        <Shell user={user} />
      ) : (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
