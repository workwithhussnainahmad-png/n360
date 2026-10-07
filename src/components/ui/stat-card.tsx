import React from "react";
import { Card, CardContent } from "./card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-6">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.11em] text-stone-500">{title}</p>
          <div className="flex items-baseline gap-2">
            <h4 className="truncate font-display text-2xl font-semibold tracking-tight text-brand-950 sm:text-3xl">{value}</h4>
            {trend && (
              <span className={`text-xs font-semibold ${trend.isPositive ? 'text-success' : 'text-danger'}`}>
                {trend.isPositive ? '+' : ''}{trend.value}%
              </span>
            )}
          </div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-brand-200 bg-brand-50">
          <Icon className="h-5 w-5 text-brand-700" />
        </div>
      </CardContent>
    </Card>
  );
}
