export function positiveInteger(value: unknown, fallback = 1, maximum = 1_000_000) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}
export function pagination(page: number, total: number, pageSize = 50) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages);
  return { page: current, pageSize, total, pages, offset: (current - 1) * pageSize };
}
