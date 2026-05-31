import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { AlertTriangle, Archive, Bus, CalendarDays, Download, Edit3, LayoutDashboard, LogOut, Mail, Plus, RefreshCcw, Save, Send, Settings, Trash2, Users } from 'lucide-react';
import './styles.css';
import { pb } from './lib/pb';
import { dayFilter, fmtDate, fmtDateTime, todayInputValue, tomorrowInputValue } from './lib/dates';
import { driverTypeLabels, rosterStatusLabels, unitStatusLabels, weekdayLabels } from './lib/labels';
import { downloadRosterExcel, generateRoster, getDashboardAlerts, publishRoster, resendRosterEmail, type DashboardAlert } from './lib/api';
import { cn } from './lib/utils';
import type { AnyRecord, AuthUser, DailyRoster, Driver, EmailRecipient, RosterEntry, StandbyEntry, Unit } from './types/pocketbase';
import { AlertBox } from './components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from './components/ui/alert-dialog';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Dialog, DialogContent } from './components/ui/dialog';
import { Input, Label, NativeSelect } from './components/ui/form';
import { Table, TableWrap, Td, Th } from './components/ui/table';

type Column<T extends AnyRecord> = { key: string; label: string; render?: (row: T) => React.ReactNode };

function errMsg(e: unknown) { return e instanceof Error ? e.message : 'Ocurrió un error inesperado.'; }

function App() {
  const [user, setUser] = useState<AuthUser | null>(pb.authStore.record as AuthUser | null);
  useEffect(() => pb.authStore.onChange(() => setUser(pb.authStore.record as AuthUser | null)), []);
  return <BrowserRouter>{user ? <Shell user={user} /> : <Routes><Route path="/login" element={<Login />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>}</BrowserRouter>;
}

function Shell({ user }: { user: AuthUser }) {
  const navigate = useNavigate();
  const nav = [
    ['/', 'Panel', LayoutDashboard],
    ['/conductores', 'Conductores', Users],
    ['/unidades', 'Unidades', Bus],
    ['/rol', 'Rol', CalendarDays],
    ['/historial', 'Historial', Archive],
  ] as const;
  return <div className="min-h-screen bg-zinc-50 text-zinc-950 md:grid md:grid-cols-[248px_1fr]">
    <aside className="border-b border-zinc-200 bg-zinc-950 p-4 text-white md:min-h-screen md:border-b-0">
      <div className="mb-5 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-700 font-bold">R13</div><div><div className="text-lg font-semibold">Ruta 13</div><div className="text-xs text-zinc-300">Rol de Trabajo</div></div></div>
      <nav className="flex gap-2 overflow-x-auto md:grid md:overflow-visible">
        {nav.map(([to, label, Icon]) => <NavItem key={to} to={to} icon={Icon} label={label} />)}
        <NavItem to="/configuracion" icon={Settings} label="Configuración" />
      </nav>
      <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-sm text-zinc-300 md:mt-auto">
        <div className="truncate">{user.email}</div>
        <Button variant="ghost" className="justify-start border-white/10 text-white hover:bg-white/10" onClick={() => { pb.authStore.clear(); navigate('/login'); }}><LogOut className="h-4 w-4" />Salir</Button>
      </div>
    </aside>
    <main className="p-4 md:p-8"><Routes><Route path="/" element={<Dashboard />} /><Route path="/conductores" element={<Drivers />} /><Route path="/unidades" element={<Units />} /><Route path="/rol" element={<Roster />} /><Route path="/historial" element={<History />} /><Route path="/configuracion" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main>
  </div>;
}

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return <NavLink to={to} end={to === '/'} className={({ isActive }) => cn('flex h-10 shrink-0 items-center gap-2 rounded-md border border-white/10 px-3 text-sm text-zinc-200 transition-colors hover:bg-white/10', isActive && 'bg-white/15 text-white')}><Icon className="h-4 w-4" />{label}</NavLink>;
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) { e.preventDefault(); setError(''); setLoading(true); try { await pb.collection('users').authWithPassword(email, password); navigate('/'); } catch { setError('Correo o contraseña incorrectos.'); } finally { setLoading(false); } }
  return <div className="grid min-h-screen place-items-center bg-zinc-100 p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle className="text-2xl">Ruta 13</CardTitle><p className="text-sm text-zinc-500">Sistema de Rol de Trabajo</p></CardHeader><CardContent><form className="grid gap-4" onSubmit={submit}>{error && <AlertBox variant="danger">{error}</AlertBox>}<Label>Correo<Input value={email} onChange={e => setEmail(e.target.value)} /></Label><Label>Contraseña<Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></Label><Button disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</Button></form></CardContent></Card></div>;
}

function Dashboard() {
  const [drivers, setDrivers] = useState(0), [operational, setOperational] = useState(0), [shop, setShop] = useState(0);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]), [rosters, setRosters] = useState<DailyRoster[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => { void refresh(); }, []);
  async function refresh() { setError(''); setLoading(true); try { const [d, op, sh, al, rs] = await Promise.all([pb.collection('drivers').getList(1, 1, { filter: 'is_active=true', requestKey: 'dash-drivers' }), pb.collection('units').getList(1, 1, { filter: 'status="operational"', requestKey: 'dash-units-op' }), pb.collection('units').getList(1, 1, { filter: 'status="in_shop"', requestKey: 'dash-units-shop' }), getDashboardAlerts(), pb.collection('daily_rosters').getFullList({ sort: '-date', requestKey: 'dash-rosters' })]); setDrivers(d.totalItems); setOperational(op.totalItems); setShop(sh.totalItems); setAlerts(al.alerts || []); setRosters(rs as unknown as DailyRoster[]); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); } }
  const tomorrowRoster = rosters.find(r => String(r.date).slice(0, 10) === tomorrowInputValue());
  const todayRoster = rosters.find(r => String(r.date).slice(0, 10) === todayInputValue() && r.status === 'published');
  return <Page title="Panel" action={<Button variant="outline" onClick={refresh}><RefreshCcw className="h-4 w-4" />Actualizar</Button>}>
    {error && <AlertBox variant="danger">{error}</AlertBox>}
    <div className="grid gap-3 md:grid-cols-3"><Metric label="Conductores activos" value={drivers} loading={loading} /><Metric label="Unidades operacionales" value={operational} loading={loading} /><Metric label="Unidades en taller" value={shop} loading={loading} /></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2"><Card><CardHeader><CardTitle>Rol de mañana</CardTitle></CardHeader><CardContent className="flex items-center justify-between gap-3"><span>{tomorrowRoster ? rosterStatusLabels[tomorrowRoster.status] : 'No generado'}</span><Button asChild><Link to="/rol">Abrir rol</Link></Button></CardContent></Card><Card><CardHeader><CardTitle>Rol de hoy</CardTitle></CardHeader><CardContent className="flex items-center justify-between gap-3"><span>{todayRoster ? 'Publicado' : 'No publicado'}</span>{todayRoster && <Button variant="outline" onClick={() => handleDownload(todayRoster.id, setError)}><Download className="h-4 w-4" />Descargar Excel</Button>}</CardContent></Card></div>
    <div className="mt-4 grid gap-2">{alerts.map((a, i) => <AlertBox key={i}><AlertTriangle className="h-4 w-4" />{alertText(a)}</AlertBox>)}</div>
    <SectionTitle>Roles recientes</SectionTitle><DataTable rows={rosters.slice(0, 6)} columns={[{ key: 'date', label: 'Fecha', render: r => fmtDate(r.date) }, { key: 'status', label: 'Estado', render: r => <RosterStatusBadge status={r.status} /> }, { key: 'published_at', label: 'Publicado', render: r => fmtDateTime(r.published_at) || '-' }, { key: 'actions', label: 'Acciones', render: r => <Button size="sm" variant="outline" onClick={() => handleDownload(r.id, setError)}><Download className="h-4 w-4" />Excel</Button> }]} />
  </Page>;
}

function Drivers() {
  const canEdit = true;
  const blank = { name: '', type: 'base', rest_day: 'monday', is_active: true };
  const [rows, setRows] = useState<Driver[]>([]), [q, setQ] = useState(''), [type, setType] = useState('all'), [status, setStatus] = useState('all'), [editing, setEditing] = useState<Driver | null>(null), [open, setOpen] = useState(false), [form, setForm] = useState<any>(blank), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { void load(); }, []);
  async function load() { setError(''); try { setRows(await pb.collection('drivers').getFullList({ sort: 'name' }) as unknown as Driver[]); } catch (e) { setError(errMsg(e)); } }
  function start(row?: Driver) { setEditing(row || null); setForm(row ? { name: row.name, type: row.type, rest_day: row.rest_day || 'monday', is_active: !!row.is_active } : blank); setOpen(true); }
  async function save(e: React.FormEvent) { e.preventDefault(); setError(''); setSaving(true); try { const payload = { ...form, rest_day: form.type === 'base' ? form.rest_day : '' }; editing ? await pb.collection('drivers').update(editing.id, payload) : await pb.collection('drivers').create(payload); setOpen(false); await load(); } catch (e) { setError(errMsg(e)); } finally { setSaving(false); } }
  async function deactivate(row: Driver) { setError(''); try { await pb.collection('drivers').update(row.id, { is_active: false }); await load(); } catch (e) { setError(errMsg(e)); } }
  const filtered = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()) && (type === 'all' || r.type === type) && (status === 'all' || String(r.is_active) === status));
  return <Page title="Conductores" action={canEdit && <Button onClick={() => start()}><Plus className="h-4 w-4" />Nuevo conductor</Button>}>
    {error && <AlertBox variant="danger">{error}</AlertBox>}
    <Filters><Input placeholder="Buscar conductor" value={q} onChange={e => setQ(e.target.value)} /><NativeSelect value={type} onChange={e => setType(e.target.value)}><option value="all">Todos los tipos</option><option value="base">Base</option><option value="relief">Relevo</option></NativeSelect><NativeSelect value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="true">Activos</option><option value="false">Inactivos</option></NativeSelect></Filters>
    <DataTable rows={filtered} onRowClick={canEdit ? r => start(r) : undefined} columns={[{ key: 'name', label: 'Nombre' }, { key: 'type', label: 'Tipo', render: r => driverTypeLabels[r.type] }, { key: 'rest_day', label: 'Día de descanso', render: r => r.rest_day ? weekdayLabels[r.rest_day] : '-' }, { key: 'is_active', label: 'Estado', render: r => <Badge variant={r.is_active ? 'success' : 'secondary'}>{r.is_active ? 'Activo' : 'Inactivo'}</Badge> }, { key: 'actions', label: 'Acciones', render: r => canEdit && <div className="flex gap-2" onClick={e => e.stopPropagation()}><Button size="sm" variant="outline" onClick={() => start(r)}><Edit3 className="h-4 w-4" />Editar</Button>{r.is_active && <ConfirmButton title="Desactivar conductor" description="El conductor dejará de aparecer en asignaciones nuevas, pero su historial se conservará." confirmLabel="Desactivar" variant="secondary" onConfirm={() => deactivate(r)}>Desactivar</ConfirmButton>}</div> }]} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title={editing ? 'Editar conductor' : 'Nuevo conductor'}><form className="grid gap-4" onSubmit={save}><Label>Nombre<Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Label><Label>Tipo<NativeSelect value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="base">Base</option><option value="relief">Relevo</option></NativeSelect></Label>{form.type === 'base' && <Label>Día de descanso<NativeSelect value={form.rest_day} onChange={e => setForm({ ...form, rest_day: e.target.value })}>{Object.entries(weekdayLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect></Label>}<Label>Estado<NativeSelect value={String(form.is_active)} onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></NativeSelect></Label><Button disabled={saving} className="w-fit"><Save className="h-4 w-4" />{saving ? 'Guardando...' : 'Guardar'}</Button></form></DialogContent></Dialog>
  </Page>;
}

function Units() {
  const canEdit = true;
  const blank = { number: '', status: 'operational', base_driver: '' };
  const [rows, setRows] = useState<Unit[]>([]), [drivers, setDrivers] = useState<Driver[]>([]), [status, setStatus] = useState('all'), [editing, setEditing] = useState<Unit | null>(null), [open, setOpen] = useState(false), [form, setForm] = useState<any>(blank), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { void load(); }, []);
  async function load() { setError(''); try { const [units, bases] = await Promise.all([pb.collection('units').getFullList({ sort: 'number', expand: 'base_driver' }), pb.collection('drivers').getFullList({ filter: 'type="base" && is_active=true', sort: 'name' })]); setRows(units as unknown as Unit[]); setDrivers(bases as unknown as Driver[]); } catch (e) { setError(errMsg(e)); } }
  function start(row?: Unit) { setEditing(row || null); setForm(row ? { number: row.number, status: row.status, base_driver: row.base_driver || '' } : blank); setOpen(true); }
  async function save(e: React.FormEvent) { e.preventDefault(); setError(''); setSaving(true); try { editing ? await pb.collection('units').update(editing.id, form) : await pb.collection('units').create(form); setOpen(false); await load(); } catch (e) { setError(errMsg(e)); } finally { setSaving(false); } }
  async function remove(row: Unit) { setError(''); try { await pb.collection('units').delete(row.id); await load(); } catch (e) { setError(errMsg(e)); } }
  const used = new Set(rows.filter(r => !editing || r.id !== editing.id).map(r => r.base_driver).filter(Boolean));
  const filtered = rows.filter(r => status === 'all' || r.status === status);
  return <Page title="Unidades" action={canEdit && <Button onClick={() => start()}><Plus className="h-4 w-4" />Nueva unidad</Button>}>
    {error && <AlertBox variant="danger">{error}</AlertBox>}
    <Filters><NativeSelect value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todos los estados</option><option value="operational">Operacional</option><option value="in_shop">En taller</option></NativeSelect></Filters>
    <DataTable rows={filtered} onRowClick={canEdit ? r => start(r) : undefined} columns={[{ key: 'number', label: 'Unidad', render: r => <span className="inline-flex items-center gap-2">{r.status === 'operational' && !r.base_driver && <AlertTriangle className="h-4 w-4 text-amber-600" />}{r.number}</span> }, { key: 'base_driver', label: 'Conductor designado', render: r => r.expand?.base_driver?.name || <Badge variant="warning">Sin conductor</Badge> }, { key: 'status', label: 'Estado', render: r => <UnitStatusBadge status={r.status} /> }, { key: 'cycle_position', label: 'Posición de ciclo' }, { key: 'actions', label: 'Acciones', render: r => canEdit && <div className="flex gap-2" onClick={e => e.stopPropagation()}><Button size="sm" variant="outline" onClick={() => start(r)}><Edit3 className="h-4 w-4" />Editar</Button><ConfirmButton title="Eliminar unidad" description="Esta acción eliminará la unidad. Los roles históricos conservarán sus registros existentes." confirmLabel="Eliminar" variant="destructive" onConfirm={() => remove(r)}><Trash2 className="h-4 w-4" />Eliminar</ConfirmButton></div> }]} />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title={editing ? 'Editar unidad' : 'Nueva unidad'}><form className="grid gap-4" onSubmit={save}><Label>Número de unidad<Input required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} /></Label><Label>Estado<NativeSelect value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="operational">Operacional</option><option value="in_shop">En taller</option></NativeSelect></Label><Label>Conductor designado<NativeSelect value={form.base_driver} onChange={e => setForm({ ...form, base_driver: e.target.value })}><option value="">Sin conductor</option>{drivers.filter(d => !used.has(d.id) || d.id === form.base_driver).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Label><Button disabled={saving} className="w-fit"><Save className="h-4 w-4" />{saving ? 'Guardando...' : 'Guardar'}</Button></form></DialogContent></Dialog>
  </Page>;
}

function Roster() {
  const [date, setDate] = useState(tomorrowInputValue()), [roster, setRoster] = useState<DailyRoster | null>(null), [entries, setEntries] = useState<RosterEntry[]>([]), [standby, setStandby] = useState<StandbyEntry[]>([]), [drivers, setDrivers] = useState<Driver[]>([]), [loading, setLoading] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { void pb.collection('drivers').getFullList({ filter: 'is_active=true', sort: 'name' }).then(r => setDrivers(r as unknown as Driver[])); void load(); }, []);
  async function load(id?: string) { setError(''); setLoading(true); try { const r = id ? await pb.collection('daily_rosters').getOne(id) as DailyRoster : (await pb.collection('daily_rosters').getFullList({ filter: dayFilter('date', date), sort: '-date' }) as unknown as DailyRoster[])[0]; setRoster(r || null); if (!r) { setEntries([]); setStandby([]); return; } const [re, st] = await Promise.all([pb.collection('roster_entries').getFullList({ filter: `roster="${r.id}"`, sort: 'departure_time', expand: 'unit,driver' }), pb.collection('standby_entries').getFullList({ filter: `roster="${r.id}"`, sort: 'position', expand: 'driver' })]); setEntries(re as unknown as RosterEntry[]); setStandby(st as unknown as StandbyEntry[]); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); } }
  async function generate() { setError(''); setLoading(true); setMessage(''); try { const res = await generateRoster(date); await load(res.roster_id); setMessage('Rol generado.'); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); } }
  async function publish() { if (!roster) return; setError(''); setLoading(true); try { await publishRoster(roster.id); setMessage('Rol publicado y enviado.'); await load(roster.id); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); } }
  async function updateEntry(row: RosterEntry, driver: string) { setError(''); try { await pb.collection('roster_entries').update(row.id, { driver, is_substitute: driver !== row.expand?.unit?.base_driver }); if (roster) await load(roster.id); } catch (e) { setError(errMsg(e)); } }
  async function updateStandby(row: StandbyEntry, driver: string) { setError(''); try { await pb.collection('standby_entries').update(row.id, { driver }); if (roster) await load(roster.id); } catch (e) { setError(errMsg(e)); } }
  const assigned = [...entries.map(e => e.driver).filter(Boolean), ...standby.map(s => s.driver).filter(Boolean)];
  const duplicate = assigned.some((id, i) => assigned.indexOf(id) !== i);
  return <Page title="Generador de rol" action={<div className="flex flex-wrap gap-2"><Input className="w-auto" type="date" value={date} onChange={e => setDate(e.target.value)} /><Button variant="outline" disabled={loading} onClick={() => load()}><RefreshCcw className="h-4 w-4" />Cargar</Button>{roster ? <ConfirmButton title="Re-generar rol" description="Esto eliminará el rol actual para esta fecha y creará uno nuevo." confirmLabel="Re-generar" disabled={loading} onConfirm={generate}><RefreshCcw className="h-4 w-4" />Re-generar rol</ConfirmButton> : <Button disabled={loading} onClick={generate}><RefreshCcw className="h-4 w-4" />Generar rol</Button>}</div>}>
    {error && <AlertBox variant="danger">{error}</AlertBox>}
    {message && <AlertBox variant="success">{message}</AlertBox>}{duplicate && <AlertBox><AlertTriangle className="h-4 w-4" />Hay conductores asignados más de una vez. Revisa el rol antes de publicarlo.</AlertBox>}{entries.some(e => !e.driver) && <AlertBox><AlertTriangle className="h-4 w-4" />Hay unidades sin conductor asignado.</AlertBox>}{standby.length > 0 && standby.length < 10 && <AlertBox><AlertTriangle className="h-4 w-4" />La lista tiene menos de 10 relevos de presentación.</AlertBox>}
    {!roster ? <Card><CardContent className="p-6 text-sm text-zinc-600">No hay rol para esta fecha.</CardContent></Card> : <><Card className="mb-4"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="flex flex-wrap items-center gap-3"><strong>Estado:</strong><RosterStatusBadge status={roster.status} />{roster.published_at && <span className="text-sm text-zinc-500">Publicado: {fmtDateTime(roster.published_at)}</span>}</div><div className="flex gap-2"><ConfirmButton title="Publicar rol" description="Se publicará el rol y se enviará el Excel a los destinatarios activos." confirmLabel="Publicar" disabled={loading || duplicate} onConfirm={publish}><Send className="h-4 w-4" />Publicar rol</ConfirmButton><Button variant="outline" onClick={() => handleDownload(roster.id, setError)}><Download className="h-4 w-4" />Descargar Excel</Button></div></CardContent></Card><TableWrap><Table><thead><tr><Th>Unidad</Th><Th>Conductor</Th><Th>Hora de salida</Th><Th>Tipo</Th></tr></thead><tbody>{entries.map(e => <tr key={e.id} className={cn(e.is_substitute && 'bg-amber-50')}><Td>{!e.expand?.unit?.base_driver && <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />}{e.expand?.unit?.number}</Td><Td><NativeSelect value={e.driver || ''} onChange={ev => updateEntry(e, ev.target.value)}><option value="">Sin asignar</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Td><Td>{e.departure_time}</Td><Td><Badge variant={e.is_substitute ? 'warning' : 'default'}>{e.is_substitute ? 'Relevo' : 'Base'}</Badge></Td></tr>)}</tbody></Table></TableWrap><SectionTitle>Relevos de presentación</SectionTitle><TableWrap><Table className="min-w-[420px]"><thead><tr><Th>#</Th><Th>Conductor</Th></tr></thead><tbody>{standby.map(s => <tr key={s.id}><Td>{s.position}</Td><Td><NativeSelect value={s.driver} onChange={e => updateStandby(s, e.target.value)}>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></Td></tr>)}</tbody></Table></TableWrap></>}
  </Page>;
}

function History() {
  const isAdmin = true;
  const [rows, setRows] = useState<DailyRoster[]>([]), [selected, setSelected] = useState<DailyRoster | null>(null), [entries, setEntries] = useState<RosterEntry[]>([]), [standby, setStandby] = useState<StandbyEntry[]>([]), [error, setError] = useState('');
  useEffect(() => { void load(); }, []);
  async function load() { setError(''); try { setRows(await pb.collection('daily_rosters').getFullList({ sort: '-date' }) as unknown as DailyRoster[]); } catch (e) { setError(errMsg(e)); } }
  async function open(row: DailyRoster) { setError(''); try { setSelected(row); const [re, st] = await Promise.all([pb.collection('roster_entries').getFullList({ filter: `roster="${row.id}"`, sort: 'departure_time', expand: 'unit,driver' }), pb.collection('standby_entries').getFullList({ filter: `roster="${row.id}"`, sort: 'position', expand: 'driver' })]); setEntries(re as unknown as RosterEntry[]); setStandby(st as unknown as StandbyEntry[]); } catch (e) { setError(errMsg(e)); } }
  async function resend(row: DailyRoster) { setError(''); try { await resendRosterEmail(row.id); } catch (e) { setError(errMsg(e)); } }
  return <Page title="Historial de roles">
    {error && <AlertBox variant="danger">{error}</AlertBox>}
    <DataTable rows={rows} onRowClick={r => open(r)} columns={[{ key: 'date', label: 'Fecha', render: r => fmtDate(r.date) }, { key: 'status', label: 'Estado', render: r => <RosterStatusBadge status={r.status} /> }, { key: 'published_at', label: 'Publicado', render: r => fmtDateTime(r.published_at) || '-' }, { key: 'actions', label: 'Acciones', render: r => <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}><Button size="sm" variant="outline" onClick={() => open(r)}>Ver</Button><Button size="sm" variant="outline" onClick={() => handleDownload(r.id, setError)}>Excel</Button>{isAdmin && <ConfirmButton title="Re-enviar correo" description="Se enviará nuevamente el Excel de este rol a los destinatarios activos." confirmLabel="Re-enviar" variant="secondary" onConfirm={() => resend(r)}><Mail className="h-4 w-4" />Re-enviar</ConfirmButton>}</div> }]} /><Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}><DialogContent title={`Rol ${fmtDate(selected?.date)}`}><SectionTitle>Rol del día</SectionTitle><DataTable rows={entries} columns={[{ key: 'unit', label: 'Unidad', render: r => r.expand?.unit?.number }, { key: 'driver', label: 'Conductor', render: r => r.expand?.driver?.name || 'Sin asignar' }, { key: 'departure_time', label: 'Hora' }, { key: 'is_substitute', label: 'Tipo', render: r => r.is_substitute ? 'Relevo' : 'Base' }]} /><SectionTitle>Relevos de presentación</SectionTitle><DataTable rows={standby} columns={[{ key: 'position', label: '#' }, { key: 'driver', label: 'Conductor', render: r => r.expand?.driver?.name }]} /></DialogContent></Dialog>
  </Page>;
}

function SettingsPage() {
  const blank = { name: '', email: '', is_active: true };
  const [rows, setRows] = useState<EmailRecipient[]>([]), [editing, setEditing] = useState<EmailRecipient | null>(null), [open, setOpen] = useState(false), [form, setForm] = useState<any>(blank), [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { void load(); }, []);
  async function load() { setError(''); try { setRows(await pb.collection('email_recipients').getFullList({ sort: 'email' }) as unknown as EmailRecipient[]); } catch (e) { setError(errMsg(e)); } }
  function start(row?: EmailRecipient) { setEditing(row || null); setForm(row ? { name: row.name || '', email: row.email, is_active: !!row.is_active } : blank); setOpen(true); }
  async function save(e: React.FormEvent) { e.preventDefault(); setError(''); setSaving(true); try { editing ? await pb.collection('email_recipients').update(editing.id, form) : await pb.collection('email_recipients').create(form); setOpen(false); await load(); } catch (e) { setError(errMsg(e)); } finally { setSaving(false); } }
  async function toggle(row: EmailRecipient) { setError(''); try { await pb.collection('email_recipients').update(row.id, { is_active: !row.is_active }); await load(); } catch (e) { setError(errMsg(e)); } }
  async function remove(row: EmailRecipient) { setError(''); try { await pb.collection('email_recipients').delete(row.id); await load(); } catch (e) { setError(errMsg(e)); } }
  return <Page title="Configuración" action={<Button onClick={() => start()}><Plus className="h-4 w-4" />Agregar destinatario</Button>}>
    {error && <AlertBox variant="danger">{error}</AlertBox>}
    <SectionTitle>Destinatarios del correo</SectionTitle><DataTable rows={rows} columns={[{ key: 'name', label: 'Nombre', render: r => r.name || '-' }, { key: 'email', label: 'Correo' }, { key: 'is_active', label: 'Estado', render: r => <Badge variant={r.is_active ? 'success' : 'secondary'}>{r.is_active ? 'Activo' : 'Inactivo'}</Badge> }, { key: 'actions', label: 'Acciones', render: r => <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => start(r)}><Edit3 className="h-4 w-4" />Editar</Button><Button size="sm" variant="secondary" onClick={() => toggle(r)}>{r.is_active ? 'Desactivar' : 'Activar'}</Button><ConfirmButton title="Eliminar destinatario" description="Este destinatario dejará de recibir correos del rol." confirmLabel="Eliminar" variant="destructive" onConfirm={() => remove(r)}><Trash2 className="h-4 w-4" />Eliminar</ConfirmButton></div> }]} /><Dialog open={open} onOpenChange={setOpen}><DialogContent title={editing ? 'Editar destinatario' : 'Agregar destinatario'}><form className="grid gap-4" onSubmit={save}><Label>Nombre<Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Label><Label>Correo<Input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Label><Label>Estado<NativeSelect value={String(form.is_active)} onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}><option value="true">Activo</option><option value="false">Inactivo</option></NativeSelect></Label><Button disabled={saving} className="w-fit"><Save className="h-4 w-4" />{saving ? 'Guardando...' : 'Guardar'}</Button></form></DialogContent></Dialog>
  </Page>;
}

async function handleDownload(rosterId: string, setError: (msg: string) => void) {
  try { await downloadRosterExcel(rosterId); } catch (e) { setError(errMsg(e)); }
}

function ConfirmButton({ title, description, confirmLabel, children, onConfirm, variant = 'default', disabled }: { title: string; description: string; confirmLabel: string; children: React.ReactNode; onConfirm: () => void | Promise<void>; variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'; disabled?: boolean }) { return <AlertDialog><AlertDialogTrigger asChild><Button size="sm" variant={variant} disabled={disabled}>{children}</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>; }
function Page({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) { return <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold tracking-normal">{title}</h1>{action}</div><div className="grid gap-4">{children}</div></section>; }
function SectionTitle({ children }: { children: React.ReactNode }) { return <h2 className="mt-2 text-lg font-semibold">{children}</h2>; }
function Filters({ children }: { children: React.ReactNode }) { return <Card><CardContent className="grid gap-3 p-4 md:grid-cols-3">{children}</CardContent></Card>; }
function Metric({ label, value, loading }: { label: string; value: number; loading: boolean }) { return <Card><CardContent className="p-5"><div className="text-sm text-zinc-500">{label}</div><div className="mt-2 text-3xl font-semibold">{loading ? '...' : value}</div></CardContent></Card>; }
function DataTable<T extends AnyRecord>({ rows, columns, onRowClick }: { rows: T[]; columns: Column<T>[]; onRowClick?: (row: T) => void }) { return <TableWrap><Table><thead><tr>{columns.map(c => <Th key={c.key}>{c.label}</Th>)}</tr></thead><tbody>{rows.length ? rows.map(r => <tr key={r.id} onClick={() => onRowClick?.(r)} className={onRowClick ? 'cursor-pointer hover:bg-zinc-50' : ''}>{columns.map(c => <Td key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</Td>)}</tr>) : <tr><Td colSpan={columns.length} className="text-zinc-500">Sin registros.</Td></tr>}</tbody></Table></TableWrap>; }
function RosterStatusBadge({ status }: { status: string }) { return <Badge variant={status === 'published' ? 'success' : 'warning'}>{rosterStatusLabels[status] || status}</Badge>; }
function UnitStatusBadge({ status }: { status: string }) { return <Badge variant={status === 'operational' ? 'success' : 'secondary'}>{unitStatusLabels[status] || status}</Badge>; }
function alertText(a: DashboardAlert) { if (a.type === 'unit_no_driver') return `La unidad ${a.unit_number} no tiene conductor designado.`; if (a.type === 'standby_shortage') return `Solo hay ${a.available} relevos de presentación disponibles para ${fmtDate(a.for_date)}.`; return `El rol de ${fmtDate(a.for_date)} no se ha generado o enviado.`; }

createRoot(document.getElementById('root')!).render(<App />);
