"use client";

import { AppShell } from "@/components/layout/AppShell";
import type { ShellBrand } from "@/components/layout/BrandMark";
import { LayoutDashboard, CheckSquare, FileEdit, CalendarDays, Megaphone, ClipboardList, CalendarCheck, FileQuestion, Ticket, Book, BookOpen } from "lucide-react";

const SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/staff/dashboard", icon: LayoutDashboard },
  { label: "Daily Diary", href: "/staff/diary", icon: Book },
  { label: "Courses", href: "/staff/courses", icon: BookOpen },
  { label: "Timetable", href: "/staff/timetable", icon: CalendarDays },
  { label: "Exam Timetable", href: "/staff/exams", icon: CalendarCheck },
  { label: "Assignments", href: "/staff/assignments", icon: ClipboardList },
  { label: "Host Tests", href: "/staff/tests", icon: FileQuestion },
  { label: "Attendance", href: "/staff/attendance", icon: CheckSquare },
  { label: "Marks Entry", href: "/staff/marks", icon: FileEdit },
  { label: "Batch Results", href: "/batch-results", icon: ClipboardList },
  { label: "Leaves", href: "/staff/leaves", icon: CalendarDays },
  { label: "Announcements", href: "/staff/announcements", icon: Megaphone },
  { label: "Support Tickets", href: "/staff/tickets", icon: Ticket },
];

export function StaffShell({
  children,
  userId,
  institutionId,
  initialBrand,
  coursesEnabled,
}: {
  children: React.ReactNode;
  userId: number;
  institutionId?: number | null;
  initialBrand: ShellBrand;
  coursesEnabled: boolean;
}) {
  const sidebarItems = coursesEnabled
    ? SIDEBAR_ITEMS
    : SIDEBAR_ITEMS.filter((item) => item.href !== "/staff/courses");
  return (
    <AppShell
      sidebarItems={sidebarItems}
      userRole="STAFF"
      userId={userId}
      institutionId={institutionId}
      initialBrand={initialBrand}
    >
      {children}
    </AppShell>
  );
}
