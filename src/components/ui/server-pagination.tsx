import Link from "next/link";
export function ServerPagination({ page, hasMore, params = {} }: { page: number; hasMore: boolean; params?: Record<string, string | undefined> }) {
  function href(next: number) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    query.set('page', String(next));
    return `?${query}`;
  }
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
    <span>Page {page}</span>
    <div className="flex gap-4">
      {page > 1 && <Link prefetch={false} href={href(page - 1)} className="underline">Previous</Link>}
      {hasMore && <Link prefetch={false} href={href(page + 1)} className="underline">Next</Link>}
    </div>
  </nav>;
}
