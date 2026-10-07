"use client";

import { AppShell } from "@/components/layout/AppShell";
import type { ShellBrand } from "@/components/layout/BrandMark";
import { LayoutDashboard, Users, UserSquare2, BookOpen, Calendar, Settings, MapPin, Megaphone, ClipboardList, CheckSquare, ShieldCheck, Ticket, IdCard, ArrowUpRight, UserPlus, WalletCards, CalendarDays } from "lucide-react";

/** Role-permission sidebar only — leave badges load on the Leaves page. */
const SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/institution/dashboard", icon: LayoutDashboard },
  { label: "Daily Diary", href: "/institution/diary", icon: BookOpen },
  { label: "Campuses", href: "/institution/campuses", icon: MapPin },
  { label: "Academics", href: "/institution/academics", icon: BookOpen },
  { label: "Courses", href: "/institution/courses", icon: BookOpen },
  { label: "Staff", href: "/institution/staff", icon: UserSquare2 },
  { label: "Students", href: "/institution/students", icon: Users },
  { label: "Auto-Promotion", href: "/institution/students/promotion", icon: ArrowUpRight },
  { label: "ID Cards", href: "/institution/students/id-cards", icon: IdCard },
  { label: "Admissions", href: "/institution/admissions", icon: UserPlus },
  { label: "Fees", href: "/institution/fees", icon: WalletCards },
  { label: "Teacher's Attendance", href: "/institution/staff-attendance", icon: CheckSquare },
  { label: "Leaves", href: "/institution/staff-leaves", icon: Calendar },
  { label: "Timetable", href: "/institution/timetable", icon: Calendar },
  { label: "Exams", href: "/institution/exams", icon: ClipboardList },
  { label: "Announcements", href: "/institution/announcements", icon: Megaphone },
  { label: "Website Events", href: "/institution/website-events", icon: CalendarDays },
  { label: "Admins", href: "/institution/admins", icon: ShieldCheck },
  { label: "Helpdesk", href: "/institution/helpdesk", icon: Ticket },
  { label: "Settings", href: "/institution/settings", icon: Settings },
];

export default function InstitutionLayout({
  children,
  role,
  userId,
  institutionId,
  initialBrand,
}: {
  children: React.ReactNode;
  role: "INSTITUTION" | "INSTITUTION_ADMIN";
  userId?: number;
  institutionId?: number | null;
  initialBrand?: ShellBrand;
}) {
  return (
    <AppShell
      sidebarItems={SIDEBAR_ITEMS}
      userRole={role}
      userId={userId}
      institutionId={institutionId}
      initialBrand={initialBrand}
    >
      {children}
    </AppShell>
  );
}
