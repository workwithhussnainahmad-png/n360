"use client";

import { cn } from "@/lib/utils";

export function LocalDateTime({
  value,
  dateStyle = "medium",
  timeStyle = "short",
  compact = false,
  className,
}: {
  value: string | Date;
  dateStyle?: Intl.DateTimeFormatOptions["dateStyle"];
  timeStyle?: Intl.DateTimeFormatOptions["timeStyle"];
  compact?: boolean;
  className?: string;
}) {
  const isoValue = typeof value === "string" ? value : value.toISOString();
  const label = new Intl.DateTimeFormat(undefined, {
    dateStyle: compact ? "short" : dateStyle,
    timeStyle,
  }).format(new Date(isoValue));

  return (
    <time dateTime={isoValue} className={cn(compact && "whitespace-nowrap text-xs", className)} suppressHydrationWarning>
      {label}
    </time>
  );
}
