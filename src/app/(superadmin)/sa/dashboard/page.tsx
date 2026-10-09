import { DashboardAnnouncements } from "@/components/announcements/DashboardAnnouncements";
import { MobileAppVersionUpdater } from "@/components/sa/MobileAppVersionUpdater";
import { PublicSiteDomainUpdater } from "@/components/sa/PublicSiteDomainUpdater";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { db } from "@/db";
import { employees, institutions, students, systemSettings } from "@/db/schema";
import { authorizeSecurityPermission } from "@/lib/security-permissions";
import { getSession } from "@/lib/auth";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { getCachedOrFetch } from "@/lib/redis";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Building2, CheckCircle, FileCheck, Users } from "lucide-react";
import { redirect } from "next/navigation";

/**
 * Super-admin dashboard counts.
 *
 * Cache key: cache:sa:dashboard:overview
 * Scope: platform-wide (no tenant)
 * TTL: 60s
 * Invalidation: TTL-only (registration volume is low relative to TTL)
 * Acceptable staleness: ~60s for aggregate counts
 * Fallback: Valkey miss → Postgres
 */
export default async function SuperAdminDashboard() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");

  const isRoot = await authorizeSecurityPermission(session, "platform.security");
  const [overview, recentAnnouncements, recentRegistrations, settingsData] = await Promise.all([
    getCachedOrFetch("cache:sa:dashboard:overview", 60, async () => {
      const [totalInstRows, pendingInstRows, activeEmpRows, totalStudRows] = await Promise.all([
        db.select({ value: count() }).from(institutions).where(isNull(institutions.parentInstitutionId)),
        db.select({ value: count() }).from(institutions).where(and(isNull(institutions.parentInstitutionId), eq(institutions.status, "PENDING"))),
        db.select({ value: count() }).from(employees).where(isNull(employees.deletedAt)),
        db.select({ value: count() }).from(students),
      ]);
      return {
        totalInsts: totalInstRows[0]?.value ?? 0,
        pendingInsts: pendingInstRows[0]?.value ?? 0,
        activeEmps: activeEmpRows[0]?.value ?? 0,
        totalStuds: totalStudRows[0]?.value ?? 0,
      };
    }),
    getVisibleAnnouncements(session, 4),
    getCachedOrFetch("cache:sa:dashboard:recent-regs", 60, async () =>
      db
        .select({
          id: institutions.id,
          name: institutions.name,
          type: institutions.type,
          city: institutions.city,
          country: institutions.country,
          status: institutions.status,
          createdAt: institutions.createdAt,
        })
        .from(institutions)
        .where(isNull(institutions.parentInstitutionId))
      .orderBy(desc(institutions.createdAt))
        .limit(5)
    ),
    getCachedOrFetch("cache:sa:system-settings", 300, async () =>
      db.select({ mobileAppVersion: systemSettings.mobileAppVersion, publicSiteBaseDomain: systemSettings.publicSiteBaseDomain }).from(systemSettings).limit(1)
    ),
  ]);

  const currentAppVersion = settingsData[0]?.mobileAppVersion || "1.0.0";
  const publicSiteBaseDomain = settingsData[0]?.publicSiteBaseDomain || process.env.PUBLIC_SITE_BASE_DOMAIN || 'nisaab360.app';

  return (
    <div className="space-y-8 animate-fade-in">

      <MobileAppVersionUpdater currentVersion={currentAppVersion} />
      {isRoot && <PublicSiteDomainUpdater currentDomain={publicSiteBaseDomain} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Institutions" value={overview.totalInsts.toString()} icon={Building2} />
        <StatCard title="Pending Verifications" value={overview.pendingInsts.toString()} icon={FileCheck} />
        <StatCard title="Active Employees" value={overview.activeEmps.toString()} icon={Users} />
        <StatCard title="Total Students" value={overview.totalStuds.toString()} icon={CheckCircle} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentRegistrations.length === 0 && (
                <p className="text-stone-500 text-sm py-4">No recent registrations found.</p>
              )}
              {recentRegistrations.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-stone-50/50">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded bg-stone-200 flex items-center justify-center text-stone-500 text-xs font-bold">
                      {inst.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-brand-900">{inst.name}</p>
                      <p className="text-sm text-stone-500">
                        {inst.city}, {inst.country} - {inst.type}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                      inst.status === "PENDING"
                        ? "bg-warning/20 text-yellow-700"
                        : inst.status === "APPROVED"
                          ? "bg-success/20 text-emerald-700"
                          : "bg-danger/20 text-red-700"
                    }`}
                  >
                    {inst.status}
                  </span>
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
