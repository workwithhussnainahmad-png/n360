import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationNavProps = {
  currentPage: number;
  totalPages: number;
  basePath: string;
};

function pageHref(basePath: string, page: number) {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

function paginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const items: Array<number | "..."> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) items.push("...");
  for (let page = start; page <= end; page += 1) items.push(page);
  if (end < totalPages - 1) items.push("...");
  items.push(totalPages);

  return items;
}

export function PaginationNav({ currentPage, totalPages, basePath }: PaginationNavProps) {
  if (totalPages <= 1) return null;

  const previousPage = Math.max(1, currentPage - 1);
  const nextPage = Math.min(totalPages, currentPage + 1);
  const previousDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  const items = paginationItems(currentPage, totalPages);

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-stone-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs font-medium text-stone-500">
        Page {currentPage} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={pageHref(basePath, previousPage)}
          prefetch={false}
          aria-disabled={previousDisabled}
          aria-label="Previous page"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-stone-600 transition-colors hover:border-brand-200 hover:text-brand-900",
            previousDisabled && "pointer-events-none opacity-50"
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        {items.map((item, index) => (
          item === "..." ? (
            <span key={`ellipsis-${index}`} className="flex h-9 w-8 items-center justify-center text-sm text-stone-400">
              ...
            </span>
          ) : (
            <Link
              key={item}
              href={pageHref(basePath, item)}
              prefetch={false}
              aria-current={item === currentPage ? "page" : undefined}
              className={cn(
                "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors",
                item === currentPage
                  ? "bg-brand-900 text-white shadow-sm"
                  : "border border-border bg-white text-stone-600 hover:border-brand-200 hover:text-brand-900"
              )}
            >
              {item}
            </Link>
          )
        ))}
        <Link
          href={pageHref(basePath, nextPage)}
          prefetch={false}
          aria-disabled={nextDisabled}
          aria-label="Next page"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-stone-600 transition-colors hover:border-brand-200 hover:text-brand-900",
            nextDisabled && "pointer-events-none opacity-50"
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
