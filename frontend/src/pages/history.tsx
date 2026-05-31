import React, { useEffect, useState } from 'react';
import { Download, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { pb } from '@/lib/pb';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { resendRosterEmail, downloadRosterExcel } from '@/lib/api';
import { ConfirmButton, DataTable, Page, RosterStatusBadge, SectionTitle, errMsg } from '@/components/shared';
import { AlertBox } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { DailyRoster, RosterEntry, StandbyEntry } from '@/types/pocketbase';

export function History() {
  const [rows, setRows] = useState<DailyRoster[]>([]);
  const [selected, setSelected] = useState<DailyRoster | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [standby, setStandby] = useState<StandbyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    setError('');
    setLoading(true);
    try {
      setRows(await pb.collection('daily_rosters').getFullList({ sort: '-date' }) as unknown as DailyRoster[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function open(row: DailyRoster) {
    setError('');
    try {
      setSelected(row);
      const [re, st] = await Promise.all([
        pb.collection('roster_entries').getFullList({ filter: `roster="${row.id}"`, sort: 'departure_time', expand: 'unit,driver' }),
        pb.collection('standby_entries').getFullList({ filter: `roster="${row.id}"`, sort: 'position', expand: 'driver' }),
      ]);
      setEntries(re as unknown as RosterEntry[]);
      setStandby(st as unknown as StandbyEntry[]);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function resend(row: DailyRoster) {
    setError('');
    try {
      await resendRosterEmail(row.id);
      toast.success('Correo reenviado.');
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function handleDownload(id: string) {
    try {
      await downloadRosterExcel(id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Page title="Historial de roles">
      {error && <AlertBox variant="danger">{error}</AlertBox>}

      <div className="md:flex-1 md:min-h-0 md:overflow-hidden">
        <DataTable
          fill
          loading={loading}
          rows={rows}
          onRowClick={r => open(r)}
          columns={[
          { key: 'date', label: 'Fecha', render: r => fmtDate(r.date) },
          { key: 'status', label: 'Estado', render: r => <RosterStatusBadge status={r.status} /> },
          { key: 'published_at', label: 'Publicado', render: r => fmtDateTime(r.published_at) || '-' },
          {
            key: 'actions', label: 'Acciones',
            render: r => (
              <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
                <Button size="sm" variant="outline" onClick={() => open(r)}>Ver</Button>
                <Button size="sm" variant="outline" onClick={() => handleDownload(r.id)}>
                  <Download className="h-4 w-4" />Excel
                </Button>
                <ConfirmButton
                  title="Re-enviar correo"
                  description="Se enviará nuevamente el Excel de este rol a los destinatarios activos."
                  confirmLabel="Re-enviar"
                  variant="secondary"
                  onConfirm={() => resend(r)}
                >
                  <Mail className="h-4 w-4" />Re-enviar
                </ConfirmButton>
              </div>
            ),
          },
        ]}
        />
      </div>

      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent title={`Rol ${fmtDate(selected?.date)}`}>
          <SectionTitle>Rol del día</SectionTitle>
          <DataTable
            rows={entries}
            columns={[
              { key: 'unit', label: 'Unidad', render: r => r.expand?.unit?.number },
              { key: 'driver', label: 'Conductor', render: r => r.expand?.driver?.name || 'Sin asignar' },
              { key: 'departure_time', label: 'Hora' },
              { key: 'is_substitute', label: 'Tipo', render: r => r.is_substitute ? 'Relevo' : 'Base' },
            ]}
          />
          <SectionTitle>Relevos de presentación</SectionTitle>
          <DataTable
            rows={standby}
            columns={[
              { key: 'position', label: '#' },
              { key: 'driver', label: 'Conductor', render: r => r.expand?.driver?.name },
            ]}
          />
        </DialogContent>
      </Dialog>
    </Page>
  );
}
