import { sql, type SQL } from 'drizzle-orm';

// Date-only admission windows follow the platform's Pakistan calendar,
// independently of the database/session or application host timezone.
export const ADMISSION_TIME_ZONE = 'Asia/Karachi';

export function admissionCalendarDateSql(instant: SQL = sql`CURRENT_TIMESTAMP`): SQL {
  return sql`(${instant} AT TIME ZONE ${ADMISSION_TIME_ZONE})::date`;
}

const calendar = new Intl.DateTimeFormat('en', {
  timeZone: ADMISSION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function admissionCalendarDate(instant = new Date()): string {
  const parts = calendar.formatToParts(instant);
  const value = (name: string) => parts.find(part => part.type === name)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
