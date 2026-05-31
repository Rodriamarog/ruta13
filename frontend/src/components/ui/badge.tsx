import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] transition-[color,box-shadow] overflow-hidden', {
  variants: {
    variant: {
      default: 'border-transparent bg-emerald-50 text-emerald-800 [a&]:hover:bg-emerald-100',
      secondary: 'border-transparent bg-zinc-100 text-zinc-700 [a&]:hover:bg-zinc-200',
      destructive: 'border-transparent bg-red-50 text-red-800 [a&]:hover:bg-red-100',
      outline: 'text-foreground',
      warning: 'border-amber-200 bg-amber-50 text-amber-800',
      success: 'border-green-200 bg-green-50 text-green-800',
      danger: 'border-red-200 bg-red-50 text-red-800',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
