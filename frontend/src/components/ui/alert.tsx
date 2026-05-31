import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative w-full rounded-lg border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current', {
  variants: {
    variant: {
      default: 'bg-card text-card-foreground border-zinc-200 bg-white text-zinc-800',
      destructive: 'text-destructive bg-card [&>svg]:text-current border-red-200 bg-red-50 text-red-900',
      warning: 'border-amber-200 bg-amber-50 text-amber-900',
      danger: 'border-red-200 bg-red-50 text-red-900',
      success: 'border-green-200 bg-green-50 text-green-900',
      info: 'border-zinc-200 bg-white text-zinc-800',
    },
  },
  defaultVariants: { variant: 'warning' },
});
function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) { return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />; }
const AlertBox = Alert;
export { Alert, AlertBox, alertVariants };
