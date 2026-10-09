import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity, Search } from "lucide-react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SAAuditLogsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    redirect("/sa/dashboard");
  }

  const params = await searchParams;
  const page = parseInt(params.page || "1", 10) || 1;
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  // Fetch one extra to determine if there's a next page
  const fetchedLogs = await db.select()
    .from(auditLogs)
    .orderBy(desc(auditLogs.timestamp))
    .limit(pageSize + 1)
    .offset(offset);

  const hasNextPage = fetchedLogs.length > pageSize;
  const allLogs = fetchedLogs.slice(0, pageSize);

  return (
    <div className="space-y-8 animate-fade-in">

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5 text-brand-600" />
              Recent Activity
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search logs..."
                className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                disabled
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Timestamp</th>
                  <th className="px-6 py-4 font-medium">Actor Role</th>
                  <th className="px-6 py-4 font-medium">Actor ID</th>
                  <th className="px-6 py-4 font-medium">Action</th>
                  <th className="px-6 py-4 font-medium">Target</th>
                  <th className="px-6 py-4 font-medium">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                      No audit logs recorded yet.
                    </td>
                  </tr>
                )}
                {allLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4 text-stone-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-800 rounded-md">
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-stone-600 font-mono text-xs">
                      #{log.actorId}
                    </td>
                    <td className="px-6 py-4 font-medium text-brand-950">
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-stone-600">
                      {log.target}
                    </td>
                    <td className="px-6 py-4 text-stone-500 font-mono text-xs">
                      {log.ip || 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col gap-3 border-t border-border bg-stone-50/30 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="text-sm text-stone-500">
              Showing page {page}
            </div>
            <div className="flex gap-2">
              <Link 
                href={`/sa/audit?page=${page > 1 ? page - 1 : 1}`}
                prefetch={false}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border ${page <= 1 ? 'border-border text-stone-300 pointer-events-none' : 'border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors'}`}
                aria-disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Link>
              <Link 
                href={`/sa/audit?page=${page + 1}`}
                prefetch={false}
                className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border ${!hasNextPage ? 'border-border text-stone-300 pointer-events-none' : 'border-stone-300 text-stone-700 hover:bg-stone-100 transition-colors'}`}
                aria-disabled={!hasNextPage}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
