"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, ChevronDown, ChevronUp, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "./input";
import { EmptyState } from "./empty-state";

interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKey?: keyof T;
  searchPlaceholder?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  onRowClick?: (item: T) => void;
  pageSize?: number;
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

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  searchKey,
  searchPlaceholder = "Search...",
  emptyStateTitle = "No data found",
  emptyStateDescription = "Get started by creating a new record.",
  onRowClick,
  pageSize = 60,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof T; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = React.useMemo(() => {
    if (!searchKey || !searchQuery) return data;
    return data.filter((item) => {
      const val = item[searchKey];
      return String(val).toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [data, searchKey, searchQuery]);

  const sortedData = React.useMemo(() => {
    if (!sortConfig) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, pageSize, data.length]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = sortedData.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, sortedData.length);
  const paginatedData = React.useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [safePage, pageSize, sortedData]);
  const pageItems = paginationItems(safePage, totalPages);

  const handleSort = (key: keyof T) => {
    setSortConfig((current) => {
      if (current?.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' };
        return null; // toggle off
      }
      return { key, direction: 'asc' };
    });
  };

  return (
    <div className="w-full space-y-4">
      {searchKey && (
        <div className="flex flex-col gap-3 border-b border-border bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand-950">{sortedData.length} records</p>
            <p className="text-xs text-stone-500">
              {sortedData.length ? `Showing ${pageStart}-${pageEnd}` : "No matching records"}
            </p>
          </div>
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 rounded-lg border-stone-200 bg-stone-50 pl-10 pr-10 shadow-none transition-colors focus:bg-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-700"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-stone-500 bg-stone-50 uppercase border-b border-border sticky top-0">
              <tr>
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className={cn(
                      "px-6 py-3 font-medium tracking-wider",
                      col.sortable && "cursor-pointer hover:bg-stone-100 transition-colors"
                    )}
                    onClick={() => col.sortable && col.accessorKey && handleSort(col.accessorKey)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && col.accessorKey && sortConfig?.key === col.accessorKey && (
                        sortConfig.direction === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginatedData.length > 0 ? (
                paginatedData.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={cn(
                      "bg-surface transition-colors",
                      onRowClick ? "cursor-pointer hover:bg-stone-50 hover:shadow-sm" : "hover:bg-stone-50/50"
                    )}
                  >
                    {columns.map((col, i) => (
                      <td key={i} className="px-6 py-4 whitespace-nowrap">
                        {col.cell ? col.cell(row) : col.accessorKey ? String(row[col.accessorKey] ?? '') : ''}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="px-6 py-6 sm:py-12 text-center">
                    <EmptyState
                      title={emptyStateTitle}
                      description={emptyStateDescription}
                      className="border-none bg-transparent"
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {sortedData.length > pageSize && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-stone-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-stone-500">
            Page {safePage} of {totalPages}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-stone-600 transition-colors hover:border-brand-200 hover:text-brand-900 disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageItems.map((item, index) => (
              item === "..." ? (
                <span key={`ellipsis-${index}`} className="flex h-9 w-8 items-center justify-center text-sm text-stone-400">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrentPage(item)}
                  aria-current={item === safePage ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm font-semibold transition-colors",
                    item === safePage
                      ? "bg-brand-900 text-white shadow-sm"
                      : "border border-border bg-white text-stone-600 hover:border-brand-200 hover:text-brand-900"
                  )}
                >
                  {item}
                </button>
              )
            ))}
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-white text-stone-600 transition-colors hover:border-brand-200 hover:text-brand-900 disabled:pointer-events-none disabled:opacity-50"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
