import React, { useEffect, useState } from 'react';
import { Edit3 } from 'lucide-react';
import { pb } from '@/lib/pb';
import { driverTypeLabels, weekdayLabels } from '@/lib/labels';
import { ConfirmButton, DataTable, Filters, Page, errMsg } from '@/components/shared';
import { AlertBox } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/form';
import type { Driver } from '@/types/pocketbase';

const blank = { name: '', type: 'base', rest_day: 'monday', is_active: true };

export function Drivers() {
  const [rows, setRows] = useState<Driver[]>([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Driver | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(blank);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await pb.collection('drivers').getFullList({ sort: 'name' }) as unknown as Driver[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  function start(row?: Driver) {
    setEditing(row || null);
    setForm(row
      ? { name: row.name, type: row.type, rest_day: row.rest_day || 'monday', is_active: !!row.is_active }
      : blank
    );
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = { ...form, rest_day: form.type === 'base' ? form.rest_day : '' };
      editing
        ? await pb.collection('drivers').update(editing.id, payload)
        : await pb.collection('drivers').create(payload);
      setOpen(false);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(row: Driver) {
    setError('');
    try {
      await pb.collection('drivers').update(row.id, { is_active: false });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const filtered = rows.filter(r =>
    r.name.toLowerCase().includes(q.toLowerCase()) &&
    (type === 'all' || r.type === type) &&
    (status === 'all' || String(r.is_active) === status)
  );

  return (
    <Page
      title="Conductores"
      action={<Button onClick={() => start()}><span className="text-base leading-none">+</span> Nuevo conductor</Button>}
    >
      {error && <AlertBox variant="danger">{error}</AlertBox>}

      <Filters>
        <Input
          className="w-56"
          placeholder="Buscar conductor"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <NativeSelect className="w-44" value={type} onChange={e => setType(e.target.value)}>
          <option value="all">Todos los tipos</option>
          <option value="base">Base</option>
          <option value="relief">Relevo</option>
        </NativeSelect>
        <NativeSelect className="w-44" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="true">Activos</option>
          <option value="false">Inactivos</option>
        </NativeSelect>
      </Filters>

      <div className="md:flex-1 md:min-h-0 md:overflow-hidden">
        <DataTable
          fill
          loading={loading}
          rows={filtered}
          onRowClick={r => start(r)}
          columns={[
            { key: 'name', label: 'Nombre' },
            { key: 'type', label: 'Tipo', render: r => driverTypeLabels[r.type] },
            { key: 'rest_day', label: 'Día de descanso', render: r => r.rest_day ? weekdayLabels[r.rest_day] : '-' },
            {
              key: 'is_active', label: 'Estado',
              render: r => (
                <Badge variant={r.is_active ? 'success' : 'secondary'}>
                  {r.is_active ? 'Activo' : 'Inactivo'}
                </Badge>
              ),
            },
            {
              key: 'actions', label: 'Acciones',
              render: r => (
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" onClick={() => start(r)}>
                    <Edit3 className="h-4 w-4" />Editar
                  </Button>
                  {r.is_active && (
                    <ConfirmButton
                      title="Desactivar conductor"
                      description="El conductor dejará de aparecer en asignaciones nuevas, pero su historial se conservará."
                      confirmLabel="Desactivar"
                      variant="secondary"
                      onConfirm={() => deactivate(r)}
                    >
                      Desactivar
                    </ConfirmButton>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? 'Editar conductor' : 'Nuevo conductor'}>
          <form className="grid gap-4" onSubmit={save}>
            <Label>
              Nombre
              <Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Label>
            <Label>
              Tipo
              <NativeSelect value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="base">Base</option>
                <option value="relief">Relevo</option>
              </NativeSelect>
            </Label>
            {form.type === 'base' && (
              <Label>
                Día de descanso
                <NativeSelect value={form.rest_day} onChange={e => setForm({ ...form, rest_day: e.target.value })}>
                  {Object.entries(weekdayLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </NativeSelect>
              </Label>
            )}
            <Label>
              Estado
              <NativeSelect
                value={String(form.is_active)}
                onChange={e => setForm({ ...form, is_active: e.target.value === 'true' })}
              >
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </NativeSelect>
            </Label>
            <Button disabled={saving} className="w-fit">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
