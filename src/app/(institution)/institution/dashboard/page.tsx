import { DashboardAnnouncements } from "@/components/announcements/DashboardAnnouncements";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { staff, students, platformReviews, attendances } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getVisibleAnnouncements } from "@/lib/announcements";
import { count, eq, and, gte } from "drizzle-orm";
import { CheckSquare, MapPin, Users, UserSquare2 } from "lucide-react";
import { redirect } from "next/navigation";
import { PlatformReviewForm } from "@/components/PlatformReviewForm";
import { Star } from "lucide-react";
import Link from "next/link";
import { getCachedOrFetch } from "@/lib/redis";
import { listInstitutionCampuses } from "@/lib/campus-workspaces";
import { CampusSwitcher } from "@/components/institution/CampusSwitcher";
import {
  DashboardChartsProvider,
  AttendanceTrendsCard,
  ExamPerformanceCard,
  ClassDistributionCard,
} from "@/components/institution/DashboardCharts";

export default async function InstitutionDashboard() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");

  const instId = session.institutionId || session.userId;
  const campusList = await listInstitutionCampuses(session);
  const availableCampuses = campusList.filter((campus) => campus.name === campus.workspaceName);
  const homeCampus = availableCampuses.find((campus) => campus.workspaceId === session.homeInstitutionId);
  const todayStr = new Date().toISOString().split('T')[0];

  const [studentCountRows, staffCountRows, recentAnnouncements, reviewRows, todayAttendance] = await Promise.all([
    getCachedOrFetch(`cache:dashboard:students:${instId}`, 60, () =>
      db.select({ value: count() }).from(students).where(eq(students.institutionId, instId))
    ),
    getCachedOrFetch(`cache:dashboard:staff:${instId}`, 60, () =>
      db.select({ value: count() }).from(staff).where(eq(staff.institutionId, instId))
    ),
    getVisibleAnnouncements(session, 4),
    getCachedOrFetch(`cache:dashboard:reviews:${instId}`, 60, () => 
      db.select().from(platformReviews).where(eq(platformReviews.institutionId, instId)).limit(1)
    ),
    getCachedOrFetch(`cache:dashboard:today-attendance:${instId}:${todayStr}`, 60, () =>
      db.select({ status: attendances.status, value: count() })
        .from(attendances)
        .where(and(eq(attendances.institutionId, instId), gte(attendances.date, todayStr)))
        .groupBy(attendances.status)
    ),
  ]);
  const studentCount = studentCountRows[0];
  const staffCount = staffCountRows[0];
  const existingReview = reviewRows[0];

  let todayPresent = 0;
  let todayTotal = 0;
  for (const record of todayAttendance) {
    todayTotal += record.value;
    if (record.status === 'PRESENT') todayPresent += record.value;
  }
  const todayAttendanceStr = todayTotal > 0 ? `${Math.round((todayPresent / todayTotal) * 100)}%` : '--';

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col justify-end gap-4 sm:flex-row sm:items-start">

        {session.role === 'INSTITUTION' && homeCampus && session.campusId && <CampusSwitcher campuses={availableCampuses} currentCampusId={session.campusId} homeCampusId={homeCampus.id} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard title="Total Students" value={studentCount.value.toString()} icon={Users} />
        <StatCard title="Teaching Staff" value={staffCount.value.toString()} icon={UserSquare2} />
        <StatCard title="Active Campuses" value={availableCampuses.length.toString()} icon={MapPin} />
        <Link href="/institution/staff-attendance" prefetch={false} className="block h-full group focus:outline-none">
          <StatCard 
            title="Today's Attendance" 
            value={todayAttendanceStr} 
            icon={CheckSquare} 
            className="group-hover:ring-2 group-hover:ring-brand-500 transition-all cursor-pointer h-full"
          />
          <p className="text-xs text-brand-600 mt-2 font-medium flex items-center justify-end group-hover:underline">
	            View Teacher&apos;s Attendance &rarr;
          </p>
        </Link>
      </div>

      <DashboardChartsProvider>
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <AttendanceTrendsCard />
            <ExamPerformanceCard />

            {!existingReview && !session.campusReadOnly && (
              <Card className="border-brand-200 bg-brand-50/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-brand-800">
                    <Star className="h-5 w-5 fill-brand-600 text-brand-600" />
                    Leave a Review
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-stone-500 text-sm mb-4">Your feedback helps us improve Nisaab360 and will be featured on our homepage.</p>
                  <PlatformReviewForm />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4 sm:space-y-6">
            <ClassDistributionCard />
            <DashboardAnnouncements announcements={recentAnnouncements} />
          </div>
        </div>
      </DashboardChartsProvider>
    </div>
  );
}
