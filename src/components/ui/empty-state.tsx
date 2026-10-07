import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-6 sm:p-12 text-center border border-dashed border-border rounded-lg bg-surface/50", className)}>
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 mb-4">
        {Icon ? (
          <Icon className="h-10 w-10 text-brand-600 stroke-[1.5px]" />
        ) : (
          <svg className="h-10 w-10 text-brand-600 stroke-[1.5px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )}
      </div>
      <h3 className="font-display text-lg font-semibold text-brand-900">{title}</h3>
      <p className="mt-2 text-sm text-stone-500 max-w-sm">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
