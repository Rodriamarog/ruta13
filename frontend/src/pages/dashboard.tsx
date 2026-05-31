import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bus, Download, RefreshCcw, Users, Wrench } from 'lucide-react';
import { pb } from '@/lib/pb';
import { fmtDate, fmtDateTime, todayInputValue, tomorrowInputValue } from '@/lib/dates';
import { rosterStatusLabels } from '@/lib/labels';
import { getDashboardAlerts, type DashboardAlert } from '@/lib/api';
import { DataTable, handleDownload, Metric, Page, RosterStatusBadge, SectionTitle, errMsg } from '@/components/shared';
import { AlertBox } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DailyRoster } from '@/types/pocketbase';

function alertText(a: DashboardAlert): string {
  if (a.type === 'unit_no_driver') return `La unidad ${a.unit_number} no tiene conductor designado.`;
  if (a.type === 'standby_shortage') return `Solo hay ${a.available} relevos de presentación disponibles para ${fmtDate(a.for_date)}.`;
  return `El rol de ${fmtDate(a.for_date)} no se ha generado o enviado.`;
}

export function Dashboard() {
  const [drivers, setDrivers] = useState(0);
  const [operational, setOperational] = useState(0);
  const [shop, setShop] = useState(0);
  const [alerts, setAlerts] = useState<DashboardAlert[]>([]);
  const [rosters, setRosters] = useState<DailyRoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    setError('');
    setLoading(true);
    try {
      const [d, op, sh, al, rs] = await Promise.all([
        pb.collection('drivers').getList(1, 1, { filter: 'is_active=true', requestKey: 'dash-drivers' }),
        pb.collection('units').getList(1, 1, { filter: 'status="operational"', requestKey: 'dash-units-op' }),
        pb.collection('units').getList(1, 1, { filter: 'status="in_shop"', requestKey: 'dash-units-shop' }),
        getDashboardAlerts(),
        pb.collection('daily_rosters').getFullList({ sort: '-date', requestKey: 'dash-rosters' }),
      ]);
      setDrivers(d.totalItems);
      setOperational(op.totalItems);
      setShop(sh.totalItems);
      setAlerts(al.alerts || []);
      setRosters(rs as unknown as DailyRoster[]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  const tomorrowRoster = rosters.find(r => String(r.date).slice(0, 10) === tomorrowInputValue());
  const todayRoster = rosters.find(r => String(r.date).slice(0, 10) === todayInputValue() && r.status === 'published');

  return (
    <Page
      title="Panel"
      action={
        <Button variant="outline" onClick={refresh}>
          <RefreshCcw className="h-4 w-4" />Actualizar
        </Button>
      }
    >
      {error && <AlertBox variant="danger">{error}</AlertBox>}

      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="Conductores activos" value={drivers} loading={loading} icon={Users} />
        <Metric label="Unidades operacionales" value={operational} loading={loading} icon={Bus} />
        <Metric label="Unidades en taller" value={shop} loading={loading} icon={Wrench} />
      </div>

      {alerts.length > 0 && (
        <div className="grid gap-2">
          {alerts.map((a, i) => (
            <AlertBox key={i}>
              <AlertTriangle className="h-4 w-4" />
              {alertText(a)}
            </AlertBox>
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Rol de mañana</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-600">
              {tomorrowRoster ? rosterStatusLabels[tomorrowRoster.status] : 'No generado'}
            </span>
            <Button asChild><Link to="/rol">Abrir rol</Link></Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Rol de hoy</CardTitle></CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-600">
              {todayRoster ? 'Publicado' : 'No publicado'}
            </span>
            {todayRoster && (
              <Button variant="outline" onClick={() => handleDownload(todayRoster.id, setError)}>
                <Download className="h-4 w-4" />Descargar Excel
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="md:flex-1 md:min-h-0 md:flex md:flex-col">
        <SectionTitle>Roles recientes</SectionTitle>
        <div className="mt-2 md:flex-1 md:min-h-0 md:overflow-hidden">
          <DataTable
            fill
            loading={loading}
            rows={rosters.slice(0, 6)}
            columns={[
              { key: 'date', label: 'Fecha', render: r => fmtDate(r.date) },
              { key: 'status', label: 'Estado', render: r => <RosterStatusBadge status={r.status} /> },
              { key: 'published_at', label: 'Publicado', render: r => fmtDateTime(r.published_at) || '-' },
              {
                key: 'actions', label: 'Acciones', render: r => (
                  <Button size="sm" variant="outline" onClick={() => handleDownload(r.id, setError)}>
                    <Download className="h-4 w-4" />Excel
                  </Button>
                ),
              },
            ]}
          />
        </div>
      </div>
    </Page>
  );
}
