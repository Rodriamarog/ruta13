import React, { useEffect, useState } from 'react';
import { Edit3, Trash2 } from 'lucide-react';
import { pb } from '@/lib/pb';
import { ConfirmButton, DataTable, Page, SectionTitle, errMsg } from '@/components/shared';
import { AlertBox } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/form';
import type { EmailRecipient } from '@/types/pocketbase';

const blank = { name: '', email: '', is_active: true };

export function SettingsPage() {
  const [rows, setRows] = useState<EmailRecipient[]>([]);
  const [editing, setEditing] = useState<EmailRecipient | null>(null);
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
      setRows(await pb.collection('email_recipients').getFullList({ sort: 'email' }) as unknown as EmailRecipient[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  function start(row?: EmailRecipient) {
    setEditing(row || null);
    setForm(row
      ? { name: row.name || '', email: row.email, is_active: !!row.is_active }
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
        ? await pb.collection('email_recipients').update(editing.id, form)
        : await pb.collection('email_recipients').create(form);
      setOpen(false);
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(row: EmailRecipient) {
    setError('');
    try {
      await pb.collection('email_recipients').update(row.id, { is_active: !row.is_active });
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function remove(row: EmailRecipient) {
    setError('');
    try {
      await pb.collection('email_recipients').delete(row.id);
      await load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Page
      title="Configuración"
      action={
        <Button onClick={() => start()}>
          <span className="text-base leading-none">+</span> Agregar destinatario
        </Button>
      }
    >
      {error && <AlertBox variant="danger">{error}</AlertBox>}

      <SectionTitle>Destinatarios del correo</SectionTitle>
      <div className="md:flex-1 md:min-h-0 md:overflow-hidden">
        <DataTable
          fill
          loading={loading}
          rows={rows}
          columns={[
          { key: 'name', label: 'Nombre', render: r => r.name || '-' },
          { key: 'email', label: 'Correo' },
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
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => start(r)}>
                  <Edit3 className="h-4 w-4" />Editar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toggle(r)}>
                  {r.is_active ? 'Desactivar' : 'Activar'}
                </Button>
                <ConfirmButton
                  title="Eliminar destinatario"
                  description="Este destinatario dejará de recibir correos del rol."
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
        <DialogContent title={editing ? 'Editar destinatario' : 'Agregar destinatario'}>
          <form className="grid gap-4" onSubmit={save}>
            <Label>
              Nombre
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </Label>
            <Label>
              Correo
              <Input
                required
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
              />
            </Label>
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
