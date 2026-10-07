"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pakistanDateKey, type ParentPeriod } from "@/lib/parent-period";

const PERIODS: Array<{ value: ParentPeriod; label: string }> = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
];

export function ParentPeriodSelector() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("period") || "MONTHLY";
  const anchor = searchParams.get("anchor") || pakistanDateKey();

  function selectPeriod(period: ParentPeriod) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    params.delete("page");
    params.delete("month");
    router.push(`${pathname}?${params.toString()}`);
  }

  function shiftPeriod(direction: -1 | 1) {
    const date = new Date(`${anchor}T12:00:00Z`);
    if (active === "DAILY") date.setUTCDate(date.getUTCDate() + direction);
    else if (active === "WEEKLY") date.setUTCDate(date.getUTCDate() + direction * 7);
    else { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + direction); }
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", active);
    params.set("anchor", date.toISOString().slice(0, 10));
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="inline-flex rounded-full border border-stone-300 bg-white p-1 shadow-sm" aria-label="Reporting period">
        {PERIODS.map((item) => (
          <button key={item.value} type="button" onClick={() => selectPeriod(item.value)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${active === item.value ? "bg-brand-800 text-white" : "text-stone-600 hover:bg-stone-100"}`}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="inline-flex items-center rounded-full border border-stone-300 bg-white text-xs font-semibold text-stone-600 shadow-sm">
        <button type="button" aria-label="Previous period" onClick={() => shiftPeriod(-1)} className="px-2.5 py-2 hover:text-brand-900">←</button>
        <span className="min-w-20 text-center">{anchor}</span>
        <button type="button" aria-label="Next period" onClick={() => shiftPeriod(1)} className="px-2.5 py-2 hover:text-brand-900">→</button>
      </div>
    </div>
  );
}
