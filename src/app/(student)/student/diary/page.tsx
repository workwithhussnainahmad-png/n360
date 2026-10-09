"use client";
import { responseErrorMessage } from '@/lib/validation-errors';


import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, Loader2, AlertCircle } from "lucide-react";
import styles from "./diary.module.css";

type DiaryEntry = {
  id: number;
  subjectName: string | null;
  staffName: string | null;
  content: string;
};

type DiaryResult = { key: string; entries: DiaryEntry[]; error: boolean };

function localDate(value = new Date()) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

export default function StudentDiaryPage() {
  const [date, setDate] = useState(() => localDate());
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<DiaryResult | null>(null);
  const requestKey = date + ":" + retry;
  const loading = result?.key !== requestKey;
  const entries = loading ? [] : result?.entries ?? [];
  const error = !loading && result?.error;
  const selectedDay = new Date(date + "T00:00:00");
  const dateLabel = selectedDay.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const weekday = selectedDay.toLocaleDateString("en-GB", { weekday: "long" });

  useEffect(() => {
    const controller = new AbortController();
    async function loadDiary() {
      try {
        const response = await fetch("/api/student/diary?date=" + encodeURIComponent(date), { signal: controller.signal });
        if (!response.ok) throw new Error(await responseErrorMessage(response));
        const data: DiaryEntry[] = await response.json();
        if (!controller.signal.aborted) setResult({ key: requestKey, entries: data, error: false });
      } catch {
        if (!controller.signal.aborted) setResult({ key: requestKey, entries: [], error: true });
      }
    }
    void loadDiary();
    return () => controller.abort();
  }, [date, requestKey]);

  function moveDay(offset: number) {
    const next = new Date(date + "T00:00:00");
    next.setDate(next.getDate() + offset);
    setDate(localDate(next));
  }

  return (
    <div className={styles.page}>
      <section className={styles.toolbar} aria-label="Diary date">
        <div className={styles.day}>
          <span className={styles.calendarIcon}><CalendarDays size={20} aria-hidden="true" /></span>
          <div>
            <span className={styles.weekday}>{weekday}</span>
            <span className={styles.dateTitle}>{dateLabel}</span>
          </div>
        </div>
        <div className={styles.controls}>
          <button type="button" className={styles.today} onClick={() => setDate(localDate())}>Today</button>
          <div className={styles.datePicker}>
            <button type="button" aria-label="Previous day" onClick={() => moveDay(-1)}><ChevronLeft size={16} /></button>
            <input aria-label="Select diary date" type="date" value={date} onChange={(event) => { if (event.target.value) setDate(event.target.value); }} />
            <button type="button" aria-label="Next day" onClick={() => moveDay(1)}><ChevronRight size={16} /></button>
          </div>
        </div>
      </section>

      <section className={styles.panel} aria-label="Diary entries" aria-busy={loading}>
        <div className={styles.panelHeading}>
          <h2>Classwork & homework</h2>
          {!loading && !error && <span className={styles.count}>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>}
        </div>
        {loading ? (
          <div className={styles.empty} role="status">
            <Loader2 size={24} className="animate-spin" aria-hidden="true" />
            <p>Loading your diary...</p>
          </div>
        ) : error ? (
          <div className={styles.empty} role="alert">
            <span className={styles.emptyIcon}><AlertCircle size={25} aria-hidden="true" /></span>
            <h3>Unable to load your diary</h3>
            <p>Please try again to see entries for this date.</p>
            <button className={styles.today} type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.empty} role="status">
            <span className={styles.emptyIcon}><BookOpen size={26} aria-hidden="true" /></span>
            <h3>No entries for this date</h3>
            <p>No classwork or homework has been posted for {dateLabel}. Choose another date to view earlier entries.</p>
          </div>
        ) : (
          <div className={styles.entries}>
            {entries.map((entry) => (
              <article key={entry.id} className={styles.entry}>
                <div className={styles.entryHeading}>
                  <span className={styles.subjectIcon}><BookOpen size={18} aria-hidden="true" /></span>
                  <div>
                    <h3>{entry.subjectName || "General"}</h3>
                    <p>{entry.staffName || "Teacher"}</p>
                  </div>
                </div>
                <div className={styles.content}>{entry.content}</div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
