import React, { useEffect, useState } from 'react';
import { AlertTriangle, Edit3, Trash2 } from 'lucide-react';
import { pb } from '@/lib/pb';
import { ConfirmButton, DataTable, Filters, Page, UnitStatusBadge, errMsg } from '@/components/shared';
import { AlertBox } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/form';
import type { Driver, Unit } from '@/types/pocketbase';

const blank = { number: '', status: 'operational', base_driver: '' };

export function Units() {
  const [rows, setRows] = useState<Unit[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Unit | null>(null);
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
      const [units, bases] = await Promise.all([
        pb.collection('units').getFullList({ sort: 'number', expand: 'base_driver' }),
        pb.collection('drivers').getFullList({ filter: 'type="base" && is_active=true', sort: 'name' }),
      ]);
      setRows(units as unknown as Unit[]);
      setDrivers(bases as unknown as Driver[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  function start(row?: Unit) {
    setEditing(row || null);
    setForm(row
      ? { number: row.number, status: row.status, base_driver: row.base_driver || '' }
      : blank
    );
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      editing
        ? await pb.collection('units').update(editing.id, form)
        : await pb.collection('units').create(form);
      setOpen(false);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: Unit) {
    setError('');
    try {
      await pb.collection('units').delete(row.id);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const used = new Set(
    rows.filter(r => !editing || r.id !== editing.id).map(r => r.base_driver).filter(Boolean)
  );
  const filtered = rows.filter(r => statusFilter === 'all' || r.status === statusFilter);

  return (
    <Page
      title="Unidades"
      action={<Button onClick={() => start()}><span className="text-base leading-none">+</span> Nueva unidad</Button>}
    >
      {error && <AlertBox variant="danger">{error}</AlertBox>}

      <Filters>
        <NativeSelect className="w-44" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="operational">Operacional</option>
          <option value="in_shop">En taller</option>
        </NativeSelect>
      </Filters>

      <div className="md:flex-1 md:min-h-0 md:overflow-hidden">
        <DataTable
          fill
          loading={loading}
          rows={filtered}
          onRowClick={r => start(r)}
          columns={[
          {
            key: 'number', label: 'Unidad',
            render: r => (
              <span className="inline-flex items-center gap-2">
                {r.status === 'operational' && !r.base_driver && (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                )}
                {r.number}
              </span>
            ),
          },
          {
            key: 'base_driver', label: 'Conductor designado',
            render: r => r.expand?.base_driver?.name || <Badge variant="warning">Sin conductor</Badge>,
          },
          { key: 'status', label: 'Estado', render: r => <UnitStatusBadge status={r.status} /> },
          { key: 'cycle_position', label: 'Posición de ciclo' },
          {
            key: 'actions', label: 'Acciones',
            render: r => (
              <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="outline" onClick={() => start(r)}>
                  <Edit3 className="h-4 w-4" />Editar
                </Button>
                <ConfirmButton
                  title="Eliminar unidad"
                  description="Esta acción eliminará la unidad. Los roles históricos conservarán sus registros existentes."
                  confirmLabel="Eliminar"
                  variant="destructive"
                  onConfirm={() => remove(r)}
                >
                  <Trash2 className="h-4 w-4" />Eliminar
                </ConfirmButton>
              </div>
            ),
          },
        ]}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={editing ? 'Editar unidad' : 'Nueva unidad'}>
          <form className="grid gap-4" onSubmit={save}>
            <Label>
              Número de unidad
              <Input required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} />
            </Label>
            <Label>
              Estado
              <NativeSelect value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="operational">Operacional</option>
                <option value="in_shop">En taller</option>
              </NativeSelect>
            </Label>
            <Label>
              Conductor designado
              <NativeSelect value={form.base_driver} onChange={e => setForm({ ...form, base_driver: e.target.value })}>
                <option value="">Sin conductor</option>
                {drivers
                  .filter(d => !used.has(d.id) || d.id === form.base_driver)
                  .map(d => <option key={d.id} value={d.id}>{d.name}</option>)
                }
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
