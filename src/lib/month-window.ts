/** Calendar-month helpers for ranged attendance/marks fetches. */

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive window ending at `anchor` month: e.g. monthsBack=1 → current + previous. */
export function windowRange(anchor: Date, monthsBack: number): { from: string; to: string } {
  const end = endOfMonth(anchor);
  const start = startOfMonth(addMonths(anchor, -monthsBack));
  return { from: toDateString(start), to: toDateString(end) };
}

export function singleMonthRange(anchor: Date): { from: string; to: string } {
  return {
    from: toDateString(startOfMonth(anchor)),
    to: toDateString(endOfMonth(anchor)),
  };
}
