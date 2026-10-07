/** Counters contain key families only, never identity keys or cached contents. */
const enabled = process.env.PERFORMANCE_OBSERVER === '1';
const counters: Map<string, number> | null = enabled
  ? ((globalThis as any)[Symbol.for('nisaab360.performance-cache')] ?? new Map<string, number>())
  : null;
if (counters) (globalThis as any)[Symbol.for('nisaab360.performance-cache')] = counters;
function family(key: string) {
  if (key.startsWith('cache:student:dashboard:')) return 'student-dashboard';
  if (key.startsWith('cache:staff:dashboard:')) return 'staff-dashboard';
  if (key.startsWith('cache:timetable:')) return 'timetable';
  if (key.startsWith('cache:courses:enabled:')) return 'course-hint';
  if (key.startsWith('cache:announcements:visible:')) return 'announcements';
  return 'other';
}
export function observeCache(key: string, event: string, amount = 1) {
  if (!counters) return;
  const label = `${family(key)}.${event}`;
  counters.set(label, (counters.get(label) ?? 0) + amount);
}
