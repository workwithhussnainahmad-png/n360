"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const DAYS = [
  { index: 1, label: "Mon" },
  { index: 2, label: "Tue" },
  { index: 3, label: "Wed" },
  { index: 4, label: "Thu" },
  { index: 5, label: "Fri" },
  { index: 6, label: "Sat" },
];

export function DayTabs({ activeDay }: { activeDay: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleDayChange(day: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("day", String(day));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 rounded-lg bg-stone-100 p-1">
      {DAYS.map((d) => (
        <button
          key={d.index}
          onClick={() => handleDayChange(d.index)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            activeDay === d.index
              ? "bg-brand-700 text-white shadow-sm"
              : "text-stone-600 hover:bg-stone-200 hover:text-stone-900"
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}
