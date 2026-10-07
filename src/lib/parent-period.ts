export type ParentPeriod = "DAILY" | "WEEKLY" | "MONTHLY";

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function pakistanDateKey(value: Date | string = new Date()) {
  const date = typeof value === "string" ? new Date(value) : value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function resolveParentPeriod(periodValue?: string | null, anchorValue?: string | null) {
  const period: ParentPeriod = periodValue === "DAILY" || periodValue === "WEEKLY" ? periodValue : "MONTHLY";
  const fallbackAnchor = new Date(`${pakistanDateKey()}T12:00:00Z`);
  const parsed = anchorValue && /^\d{4}-\d{2}-\d{2}$/.test(anchorValue) ? new Date(`${anchorValue}T12:00:00Z`) : fallbackAnchor;
  const anchor = Number.isNaN(parsed.getTime()) ? fallbackAnchor : parsed;
  let from = new Date(anchor);
  let to = new Date(anchor);
  if (period === "WEEKLY") {
    const mondayOffset = (anchor.getUTCDay() + 6) % 7;
    from.setUTCDate(anchor.getUTCDate() - mondayOffset);
    to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 6);
  } else if (period === "MONTHLY") {
    from = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12));
    to = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 12));
  }
  return { period, anchor: dateKey(anchor), from: dateKey(from), to: dateKey(to) };
}

export function parentPeriodLabel(periodValue?: string | null, anchorValue?: string | null) {
  const range = resolveParentPeriod(periodValue, anchorValue);
  const from = new Date(`${range.from}T12:00:00Z`);
  const to = new Date(`${range.to}T12:00:00Z`);
  if (range.period === "DAILY") return from.toLocaleDateString("en-PK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  if (range.period === "WEEKLY") return `${from.toLocaleDateString("en-PK", { day: "numeric", month: "short", timeZone: "UTC" })} – ${to.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  return from.toLocaleDateString("en-PK", { month: "long", year: "numeric", timeZone: "UTC" });
}
