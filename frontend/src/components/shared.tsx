import React from 'react';
import { Inbox } from 'lucide-react';
import { downloadRosterExcel } from '@/lib/api';
import { rosterStatusLabels, unitStatusLabels } from '@/lib/labels';
import type { AnyRecord } from '@/types/pocketbase';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableWrap, Td, Th } from '@/components/ui/table';

export type Column<T extends AnyRecord> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
};

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
}

export async function handleDownload(rosterId: string, setError: (msg: string) => void) {
  try {
    await downloadRosterExcel(rosterId);
  } catch (e) {
    setError(errMsg(e));
  }
}

export function ConfirmButton({
  title,
  description,
  confirmLabel,
  children,
  onConfirm,
  variant = 'default',
  disabled,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  children: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  disabled?: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant} disabled={disabled}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Page({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="md:flex-1 md:min-h-0 md:flex md:flex-col">
      <div className="mb-5 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        {action}
      </div>
      <div className="flex flex-col gap-4 md:flex-1 md:min-h-0">{children}</div>
    </section>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-2 text-lg font-semibold">{children}</h2>;
}

export function Filters({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

export function Metric({
  label,
  value,
  loading,
  icon: Icon,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm text-zinc-500">{label}</p>
          <Icon className="mt-0.5 h-4 w-4 text-zinc-300" />
        </div>
        <div className="mt-3">
          {loading
            ? <Skeleton className="h-8 w-16" />
            : <span className="text-3xl font-semibold tabular-nums">{value}</span>
          }
        </div>
      </CardContent>
    </Card>
  );
}

export function DataTable<T extends AnyRecord>({
  rows,
  columns,
  onRowClick,
  loading,
  fill,
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  fill?: boolean;
}) {
  return (
    <TableWrap className={fill ? 'md:h-full md:overflow-y-auto' : ''}>
      <Table>
        <thead>
          <tr>
            {columns.map(c => <Th key={c.key}>{c.label}</Th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            [1, 2, 3, 4].map(i => (
              <tr key={i}>
                {columns.map(c => (
                  <Td key={c.key}>
                    <Skeleton className="h-4 w-full max-w-[180px]" />
                  </Td>
                ))}
              </tr>
            ))
          ) : rows.length ? (
            rows.map(r => (
              <tr
                key={r.id}
                onClick={() => onRowClick?.(r)}
                className={onRowClick ? 'cursor-pointer hover:bg-zinc-50' : ''}
              >
                {columns.map(c => (
                  <Td key={c.key}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '')}
                  </Td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <Td colSpan={columns.length} className="whitespace-normal py-10 text-center">
                <div className="flex flex-col items-center gap-2 text-zinc-400">
                  <Inbox className="h-7 w-7" />
                  <span className="text-sm">Sin registros.</span>
                </div>
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </TableWrap>
  );
}

export function RosterStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'published' ? 'success' : 'warning'}>
      {rosterStatusLabels[status] || status}
    </Badge>
  );
}

export function UnitStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === 'operational' ? 'success' : 'secondary'}>
      {unitStatusLabels[status] || status}
    </Badge>
  );
}
