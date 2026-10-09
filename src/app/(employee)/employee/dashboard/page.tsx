import { DashboardAnnouncements } from "@/components/announcements/DashboardAnnouncements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { db } from "@/db";
import { institutions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getCachedOrFetch } from "@/lib/redis";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Building2, FileCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Employee dashboard verification summary.
 *
 * Cache key: cache:employee:dashboard:overview
 * Scope: platform (shared across employees — same pending queue)
 * TTL: 45s
 * Invalidation: TTL-only; approve/reject will show within TTL
 * Acceptable staleness: ~45s
 * Fallback: Valkey miss → Postgres
 */
export default async function EmployeeDashboard() {
  const session = await getSession();
  if (!session || session.role !== "EMPLOYEE") redirect("/login");

  const [overview, recentAnnouncements, pendingList] = await Promise.all([
    getCachedOrFetch("cache:employee:dashboard:overview", 45, async () => {
      const [pendingRows, approvedRows] = await Promise.all([
        db.select({ value: count() }).from(institutions).where(and(isNull(institutions.parentInstitutionId), eq(institutions.status, "PENDING"))),
        db.select({ value: count() }).from(institutions).where(and(isNull(institutions.parentInstitutionId), eq(institutions.status, "APPROVED"))),
      ]);
      return {
        pending: pendingRows[0]?.value ?? 0,
        approved: approvedRows[0]?.value ?? 0,
      };
    }),
    getVisibleAnnouncements(session, 4),
    getCachedOrFetch("cache:employee:dashboard:pending-list", 45, async () =>
      db
        .select({
          id: institutions.id,
          name: institutions.name,
          city: institutions.city,
        })
        .from(institutions)
        .where(and(isNull(institutions.parentInstitutionId), eq(institutions.status, "PENDING")))
        .orderBy(desc(institutions.createdAt))
        .limit(5)
    ),
  ]);

  return (
    <div className="space-y-8 animate-fade-in">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
        <StatCard title="Assigned Verifications" value={overview.pending.toString()} icon={FileCheck} />
        <StatCard title="Processed Validations" value={overview.approved.toString()} icon={Building2} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] max-w-6xl">
        <Card>
          <CardHeader>
            <CardTitle>Needs Your Attention</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingList.length === 0 && (
                <p className="text-stone-500 text-sm py-4">No pending institutions at this time.</p>
              )}
              {pendingList.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-stone-50/50">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded bg-stone-200 flex items-center justify-center text-stone-500 text-xs font-bold">
                      {inst.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-brand-900">{inst.name}</p>
                      <p className="text-sm text-stone-500">Submitted recently - {inst.city}</p>
                    </div>
                  </div>
                  <Link
                    href="/employee/institutions"
                    prefetch={false}
                    className="px-4 py-2 text-sm font-medium bg-brand-800 text-white rounded-md hover:bg-brand-900 transition-colors"
                  >
                    Review Application
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <DashboardAnnouncements announcements={recentAnnouncements} />
      </div>
    </div>
  );
}
