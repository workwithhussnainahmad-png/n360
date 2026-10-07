import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { BookOpen, CalendarDays, Clock, MapPin, UserRound } from "lucide-react";

export type TimetableEntry = {
  id: string | number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  isBreak?: boolean;
};

const WEEK_DAYS = [
  { index: 1, short: "Mon", name: "Monday" },
  { index: 2, short: "Tue", name: "Tuesday" },
  { index: 3, short: "Wed", name: "Wednesday" },
  { index: 4, short: "Thu", name: "Thursday" },
  { index: 5, short: "Fri", name: "Friday" },
  { index: 6, short: "Sat", name: "Saturday" },
];

const PALETTE = [
  "border-l-brand-700 bg-brand-50/70 text-brand-950",
  "border-l-emerald-600 bg-emerald-50/70 text-emerald-950",
  "border-l-sky-600 bg-sky-50/70 text-sky-950",
  "border-l-amber-600 bg-amber-50/70 text-amber-950",
  "border-l-rose-600 bg-rose-50/70 text-rose-950",
  "border-l-violet-600 bg-violet-50/70 text-violet-950",
];

function timeLabel(value: string) {
  return value.substring(0, 5);
}

function slotKey(entry: Pick<TimetableEntry, "startTime" | "endTime">) {
  return `${entry.startTime}-${entry.endTime}`;
}

function colorFor(entry: TimetableEntry) {
  if (entry.isBreak) return "border-l-stone-400 bg-stone-50 text-stone-700";
  const seed = Array.from(entry.title).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PALETTE[seed % PALETTE.length];
}

function buildSlots(entries: TimetableEntry[]) {
  return Array.from(
    new Map(entries.map((entry) => [slotKey(entry), { startTime: entry.startTime, endTime: entry.endTime }])).values()
  ).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function entriesBySlotAndDay(entries: TimetableEntry[]) {
  const grouped = new Map<string, TimetableEntry[]>();
  for (const entry of entries) {
    const key = `${slotKey(entry)}-${entry.dayOfWeek}`;
    const current = grouped.get(key) ?? [];
    current.push(entry);
    grouped.set(key, current);
  }
  return grouped;
}

function EntryBlock({ entry, compact = false }: { entry: TimetableEntry; compact?: boolean }) {
  return (
    <div className={cn("border border-l-4 border-border p-3 shadow-sm", colorFor(entry), compact ? "rounded-md" : "rounded")}>
      <div className="flex items-start gap-2">
        <BookOpen className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", entry.isBreak && "hidden")} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-semibold", entry.isBreak && "italic")}>
            {entry.isBreak ? "Break / Recess" : entry.title}
          </p>
          {entry.subtitle && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-stone-600">
              <UserRound className="h-3 w-3 shrink-0" />
              {entry.subtitle}
            </p>
          )}
          {entry.meta && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-stone-600">
              <MapPin className="h-3 w-3 shrink-0" />
              {entry.meta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function WeeklyTimetable({
  entries,
  title = "Weekly Timetable",
  emptyTitle = "No timetable published",
  emptyDescription = "Once classes are scheduled, the weekly timetable will appear here.",
}: {
  entries: TimetableEntry[];
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const slots = buildSlots(entries);
  const slotDayEntries = entriesBySlotAndDay(entries);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-stone-50/70">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-brand-700" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
              <CalendarDays className="h-7 w-7 text-brand-500" />
            </div>
            <h3 className="text-lg font-bold text-brand-950">{emptyTitle}</h3>
            <p className="mt-2 max-w-md text-sm text-stone-500">{emptyDescription}</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <div className="min-w-[1040px]">
                <div className="grid grid-cols-[120px_repeat(6,minmax(140px,1fr))] border-b border-border bg-brand-950 text-white">
                  <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-brand-100">Period</div>
                  {WEEK_DAYS.map((day) => (
                    <div key={day.index} className="border-l border-white/10 px-4 py-3">
                      <p className="text-sm font-semibold">{day.name}</p>
                      <p className="text-xs text-brand-200">{day.short}</p>
                    </div>
                  ))}
                </div>
                {slots.map((slot, rowIndex) => (
                  <div key={slotKey(slot)} className="grid grid-cols-[120px_repeat(6,minmax(140px,1fr))] border-b border-border last:border-b-0">
                    <div className="bg-stone-50 px-4 py-4">
                      <p className="font-mono text-sm font-bold text-brand-950">{timeLabel(slot.startTime)}</p>
                      <p className="font-mono text-xs text-stone-500">{timeLabel(slot.endTime)}</p>
                    </div>
                    {WEEK_DAYS.map((day) => {
                      const matchingEntries = slotDayEntries.get(`${slotKey(slot)}-${day.index}`) ?? [];
                      return (
                        <div key={day.index} className={cn("min-h-28 border-l border-border p-2", rowIndex % 2 === 0 ? "bg-white" : "bg-stone-50/40")}>
                          {matchingEntries.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-xs text-stone-300">Free</div>
                          ) : (
                            <div className="space-y-2">
                              {matchingEntries.map((entry) => (
                                <EntryBlock key={entry.id} entry={entry} compact />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="divide-y divide-border lg:hidden">
              {WEEK_DAYS.map((day) => {
                const dayEntries = entries
                  .filter((entry) => entry.dayOfWeek === day.index)
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));

                return (
                  <div key={day.index} className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-semibold text-brand-950">{day.name}</h3>
                      <span className="rounded bg-stone-100 px-2 py-1 text-xs text-stone-600">{dayEntries.length} slots</span>
                    </div>
                    {dayEntries.length === 0 ? (
                      <p className="rounded border border-dashed border-border px-3 py-4 text-sm text-stone-400">No classes scheduled.</p>
                    ) : (
                      <div className="space-y-3">
                        {dayEntries.map((entry) => (
                          <div key={entry.id} className="grid grid-cols-[72px_1fr] gap-3">
                            <div className="pt-2 font-mono text-xs text-stone-500">
                              <p className="font-bold text-brand-900">{timeLabel(entry.startTime)}</p>
                              <p>{timeLabel(entry.endTime)}</p>
                            </div>
                            <EntryBlock entry={entry} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function TodayTimetableCard({
  entries,
  title = "Today's Timetable",
  emptyText = "No classes scheduled for today.",
}: {
  entries: TimetableEntry[];
  title?: string;
  emptyText?: string;
}) {
  const sortedEntries = [...entries].sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border bg-stone-50/70 pb-4">
        <CardTitle className="flex flex-col gap-2 text-lg sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-brand-700" />
            {title}
          </span>
          <span className="rounded bg-brand-100 px-2 py-1 text-xs font-semibold text-brand-800">{sortedEntries.length} slots</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {sortedEntries.length === 0 ? (
          <p className="px-6 py-6 sm:py-10 text-sm text-stone-500">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[110px_1fr_180px] bg-brand-950 px-5 py-3 text-xs font-bold uppercase tracking-wider text-brand-100">
                <div>Time</div>
                <div>Subject</div>
                <div>Details</div>
              </div>
              {sortedEntries.map((entry, index) => (
                <div key={entry.id} className="grid grid-cols-[110px_1fr_180px] items-center border-b border-border px-5 py-4 last:border-b-0">
                  <div>
                    <p className="font-mono text-sm font-bold text-brand-950">{timeLabel(entry.startTime)}</p>
                    <p className="font-mono text-xs text-stone-500">{timeLabel(entry.endTime)}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {index === 0 && <span className="h-2 w-2 rounded-full bg-success" />}
                      <p className={cn("truncate text-sm font-semibold text-brand-950", entry.isBreak && "italic text-stone-600")}>
                        {entry.isBreak ? "Break / Recess" : entry.title}
                      </p>
                    </div>
                    {entry.subtitle && <p className="mt-1 truncate text-xs text-stone-500">{entry.subtitle}</p>}
                  </div>
                  <p className="truncate text-sm text-stone-600">{entry.meta || "Class period"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
