import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, RefreshCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { pb } from '@/lib/pb';
import { dayFilter, fmtDateTime, tomorrowInputValue } from '@/lib/dates';
import { generateRoster, publishRoster, downloadRosterExcel } from '@/lib/api';
import { ConfirmButton, Page, RosterStatusBadge, SectionTitle, errMsg } from '@/components/shared';
import { AlertBox } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/form';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { DailyRoster, Driver, RosterEntry, StandbyEntry } from '@/types/pocketbase';

export function Roster() {
  const [date, setDate] = useState(tomorrowInputValue());
  const [roster, setRoster] = useState<DailyRoster | null>(null);
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [standby, setStandby] = useState<StandbyEntry[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void pb.collection('drivers')
      .getFullList({ filter: 'is_active=true', sort: 'name' })
      .then(r => setDrivers(r as unknown as Driver[]));
    void load();
  }, []);

  async function load(id?: string) {
    setError('');
    setLoading(true);
    try {
      const r = id
        ? await pb.collection('daily_rosters').getOne(id) as DailyRoster
        : (await pb.collection('daily_rosters').getFullList({
            filter: dayFilter('date', date),
            sort: '-date',
          }) as unknown as DailyRoster[])[0];
      setRoster(r || null);
      if (!r) { setEntries([]); setStandby([]); return; }
      const [re, st] = await Promise.all([
        pb.collection('roster_entries').getFullList({ filter: `roster="${r.id}"`, sort: 'departure_time', expand: 'unit,driver' }),
        pb.collection('standby_entries').getFullList({ filter: `roster="${r.id}"`, sort: 'position', expand: 'driver' }),
      ]);
      setEntries(re as unknown as RosterEntry[]);
      setStandby(st as unknown as StandbyEntry[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    setError('');
    setLoading(true);
    try {
      const res = await generateRoster(date);
      await load(res.roster_id);
      toast.success('Rol generado.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function publish() {
    if (!roster) return;
    setError('');
    setLoading(true);
    try {
      await publishRoster(roster.id);
      await load(roster.id);
      toast.success('Rol publicado y enviado.');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  async function updateEntry(row: RosterEntry, driver: string) {
    setError('');
    try {
      await pb.collection('roster_entries').update(row.id, {
        driver,
        is_substitute: driver !== row.expand?.unit?.base_driver,
      });
      if (roster) await load(roster.id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function updateStandby(row: StandbyEntry, driver: string) {
    setError('');
    try {
      await pb.collection('standby_entries').update(row.id, { driver });
      if (roster) await load(roster.id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function handleDownload() {
    if (!roster) return;
    try {
      await downloadRosterExcel(roster.id);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const assigned = [
    ...entries.map(e => e.driver).filter(Boolean),
    ...standby.map(s => s.driver).filter(Boolean),
  ];
  const duplicate = assigned.some((id, i) => assigned.indexOf(id) !== i);

  return (
    <Page
      title="Generador de rol"
      action={
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-auto"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <Button variant="outline" disabled={loading} onClick={() => load()}>
            <RefreshCcw className="h-4 w-4" />Cargar
          </Button>
          {roster ? (
            <ConfirmButton
              title="Re-generar rol"
              description="Esto eliminará el rol actual para esta fecha y creará uno nuevo."
              confirmLabel="Re-generar"
              disabled={loading}
              onConfirm={generate}
            >
              <RefreshCcw className="h-4 w-4" />Re-generar rol
            </ConfirmButton>
          ) : (
            <Button disabled={loading} onClick={generate}>
              <RefreshCcw className="h-4 w-4" />
              {loading ? 'Generando...' : 'Generar rol'}
            </Button>
          )}
        </div>
      }
    >
      {error && <AlertBox variant="danger">{error}</AlertBox>}
      {duplicate && (
        <AlertBox>
          <AlertTriangle className="h-4 w-4" />
          Hay conductores asignados más de una vez. Revisa el rol antes de publicarlo.
        </AlertBox>
      )}
      {entries.some(e => !e.driver) && (
        <AlertBox>
          <AlertTriangle className="h-4 w-4" />
          Hay unidades sin conductor asignado.
        </AlertBox>
      )}
      {standby.length > 0 && standby.length < 10 && (
        <AlertBox>
          <AlertTriangle className="h-4 w-4" />
          La lista tiene menos de 10 relevos de presentación.
        </AlertBox>
      )}

      {!roster ? (
        <Card>
          <CardContent className="p-6 text-sm text-zinc-500">
            No hay rol para esta fecha.
          </CardContent>
        </Card>
      ) : (
        <div className="md:flex-1 md:min-h-0 md:flex md:flex-col md:gap-4">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-zinc-600">Estado:</span>
                <RosterStatusBadge status={roster.status} />
                {roster.published_at && (
                  <span className="text-sm text-zinc-500">
                    Publicado: {fmtDateTime(roster.published_at)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <ConfirmButton
                  title="Publicar rol"
                  description="Se publicará el rol y se enviará el Excel a los destinatarios activos."
                  confirmLabel="Publicar"
                  disabled={loading || duplicate}
                  onConfirm={publish}
                >
                  <Send className="h-4 w-4" />
                  {loading ? 'Publicando...' : 'Publicar rol'}
                </ConfirmButton>
                <Button variant="outline" onClick={handleDownload}>
                  <Download className="h-4 w-4" />Descargar Excel
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4 md:flex-1 md:min-h-0 md:flex-row">
            {/* Main roster table */}
            <div className="md:flex md:flex-1 md:min-h-0 md:flex-col">
              <SectionTitle>Conductores de Ruta</SectionTitle>
              <div className="mt-2 md:flex-1 md:min-h-0 md:overflow-hidden">
              <TableWrap className="md:h-full md:overflow-y-auto">
                <Table>
                  <thead>
                    <tr>
                      <Th>Unidad</Th>
                      <Th>Conductor</Th>
                      <Th>Hora de salida</Th>
                      <Th>Tipo</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map(e => (
                      <tr key={e.id}>
                        <Td>
                          {!e.expand?.unit?.base_driver && (
                            <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />
                          )}
                          {e.expand?.unit?.number}
                        </Td>
                        <Td>
                          <NativeSelect
                            value={e.driver || ''}
                            onChange={ev => updateEntry(e, ev.target.value)}
                          >
                            <option value="">Sin asignar</option>
                            {drivers.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </NativeSelect>
                        </Td>
                        <Td>{e.departure_time}</Td>
                        <Td>
                          <Badge variant={e.is_substitute ? 'warning' : 'default'}>
                            {e.is_substitute ? 'Relevo' : 'Base'}
                          </Badge>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              </div>
            </div>

            {/* Standby column */}
            <div className="md:flex md:w-72 md:shrink-0 md:flex-col md:min-h-0">
              <SectionTitle>Relevos de presentación</SectionTitle>
              <div className="mt-2 md:flex-1 md:min-h-0 md:overflow-hidden">
                <TableWrap className="md:h-full md:overflow-y-auto">
                  <Table className="min-w-0">
                    <thead>
                      <tr>
                        <Th>#</Th>
                        <Th>Conductor</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {standby.map(s => (
                        <tr key={s.id}>
                          <Td>{s.position}</Td>
                          <Td>
                            <NativeSelect
                              value={s.driver}
                              onChange={e => updateStandby(s, e.target.value)}
                            >
                              {drivers.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </NativeSelect>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </div>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
