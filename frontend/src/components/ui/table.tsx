import * as React from 'react';
import { cn } from '@/lib/utils';

function TableWrap({ className, ...props }: React.ComponentProps<'div'>) { return <div data-slot="table-container" className={cn('relative w-full overflow-x-auto rounded-lg border border-zinc-200 bg-white', className)} {...props} />; }
function Table({ className, ...props }: React.ComponentProps<'table'>) { return <table data-slot="table" className={cn('w-full caption-bottom text-sm min-w-[760px]', className)} {...props} />; }
function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) { return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />; }
function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) { return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />; }
function TableRow({ className, ...props }: React.ComponentProps<'tr'>) { return <tr data-slot="table-row" className={cn('hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors', className)} {...props} />; }
function TableHead({ className, ...props }: React.ComponentProps<'th'>) { return <th data-slot="table-head" className={cn('text-foreground h-10 px-3 text-left align-middle font-medium whitespace-nowrap bg-zinc-50 text-xs text-zinc-600 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />; }
function TableCell({ className, ...props }: React.ComponentProps<'td'>) { return <td data-slot="table-cell" className={cn('px-3 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)} {...props} />; }
const Th = TableHead;
const Td = TableCell;

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap, Td, Th };
