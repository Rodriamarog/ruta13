import { pb } from './pb';

export type DashboardAlert =
  | { type: 'unit_no_driver'; unit_number: string }
  | { type: 'roster_not_sent'; for_date: string }
  | { type: 'standby_shortage'; for_date: string; available: number };

export async function downloadRosterExcel(rosterId: string): Promise<void> {
  const res = await fetch(`/api/roster/${rosterId}/export`, {
    headers: { Authorization: pb.authStore.token },
  });
  if (!res.ok) throw new Error('No se pudo descargar el Excel.');
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `Rol_${rosterId}.xlsx`;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
export function generateRoster(date: string) { return pb.send<{ roster_id: string; status: string }>('/api/roster/generate', { method: 'POST', body: { date } }); }
export function publishRoster(id: string) { return pb.send(`/api/roster/${id}/publish`, { method: 'POST' }); }
export function resendRosterEmail(id: string) { return pb.send(`/api/roster/${id}/email`, { method: 'POST' }); }
export function getDashboardAlerts() { return pb.send<{ alerts: DashboardAlert[] }>('/api/dashboard/alerts', {}); }
