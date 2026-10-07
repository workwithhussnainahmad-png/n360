"use client";

import { AppShell } from "@/components/layout/AppShell";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileQuestion,
  FileText,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Ticket,
  UploadCloud,
} from "lucide-react";

/** Role-permission sidebar only — no business-data availability gating. */
const ACTIVE_SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  { label: "Daily Diary", href: "/student/diary", icon: BookOpen },
  { label: "Courses", href: "/student/courses", icon: BookOpen },
  { label: "Announcements", href: "/student/announcements", icon: Megaphone },
  { label: "Timetable", href: "/student/timetable", icon: CalendarDays },
  { label: "Exam Timetable", href: "/student/exams", icon: CalendarCheck },
  { label: "Tests", href: "/student/tests", icon: FileQuestion },
  { label: "Attendance", href: "/student/attendance", icon: CheckSquare },
  { label: "Marks", href: "/student/marks", icon: FileText },
  { label: "Transcripts", href: "/student/transcripts", icon: FileText },
  { label: "Submissions", href: "/student/submissions", icon: UploadCloud },
  { label: "Fees", href: "/student/fees", icon: Receipt },
  { label: "ID Card", href: "/student/id-card", icon: CreditCard },
  { label: "Support Tickets", href: "/student/tickets", icon: Ticket },
];

const GRADUATED_SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/student/dashboard", icon: LayoutDashboard },
  { label: "Attendance", href: "/student/attendance", icon: CheckSquare },
  { label: "Transcripts", href: "/student/transcripts", icon: FileText },
];

export function StudentShell({
  children,
  isGraduated,
  userId,
  institutionId,
  initialBrand,
  coursesEnabled,
}: {
  children: React.ReactNode;
  isGraduated: boolean;
  userId?: number;
  institutionId?: number | null;
  initialBrand?: import("@/components/layout/BrandMark").ShellBrand;
  coursesEnabled: boolean;
}) {
  const sidebarItems = isGraduated
    ? GRADUATED_SIDEBAR_ITEMS
    : coursesEnabled
      ? ACTIVE_SIDEBAR_ITEMS
      : ACTIVE_SIDEBAR_ITEMS.filter((item) => item.href !== "/student/courses");

  return (
    <AppShell
      sidebarItems={sidebarItems}
      userRole={isGraduated ? "GRADUATED" : "STUDENT"}
      userId={userId}
      institutionId={institutionId}
      initialBrand={initialBrand}
    >
      {children}
    </AppShell>
  );
}
