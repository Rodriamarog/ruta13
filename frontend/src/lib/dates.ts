export function toDateInputValue(date: Date) { return date.toISOString().slice(0, 10); }
export function todayInputValue() { return toDateInputValue(new Date()); }
export function tomorrowInputValue() { const d = new Date(); d.setDate(d.getDate() + 1); return toDateInputValue(d); }
export function dayFilter(field: string, date: string) { return `${field} >= "${date} 00:00:00" && ${field} <= "${date} 23:59:59"`; }

export function fmtDate(value?: string) {
  if (!value) return '';
  const raw = String(value).slice(0, 10);
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return raw;
  return new Intl.DateTimeFormat('es-MX', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'America/Tijuana' }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function fmtDateTime(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Tijuana' }).format(new Date(value));
}
