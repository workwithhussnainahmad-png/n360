"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, BookOpenCheck, CalendarCheck, CalendarDays, ChevronDown, CircleDollarSign, Home, LogOut, Megaphone, NotebookPen, UserRound, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api-client";

const navigationGroups = [
  {
    label: "Academics",
    icon: BookOpenCheck,
    items: [
      { href: "/parent/diary", label: "Diary & homework", icon: NotebookPen },
      { href: "/parent/courses", label: "Courses", icon: BookOpenCheck },
      { href: "/parent/results", label: "Results", icon: BarChart3 },
    ],
  },
  {
    label: "Student record",
    icon: CalendarCheck,
    items: [
      { href: "/parent/attendance", label: "Attendance", icon: CalendarCheck },
      { href: "/parent/timetable", label: "Schedule & tests", icon: CalendarDays },
      { href: "/parent/fees", label: "Fees & payments", icon: CircleDollarSign },
    ],
  },
  {
    label: "Communication",
    icon: MessagesSquare,
    items: [
      { href: "/parent/announcements", label: "Notices", icon: Megaphone },
      { href: "/parent/requests", label: "Requests & support", icon: MessagesSquare },
    ],
  },
];

export function ParentShell({
  children,
  institutionName,
  parentName,
}: {
  children: React.ReactNode;
  institutionName: string;
  parentName: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedStudent = searchParams.get("student");
  const withStudent = (href: string) => {
    const params = new URLSearchParams();
    if (selectedStudent) params.set("student", selectedStudent);
    const period = searchParams.get("period");
    const anchor = searchParams.get("anchor");
    if (period) params.set("period", period);
    if (anchor) params.set("anchor", anchor);
    const query = params.toString();
    return query ? `${href}?${query}` : href;
  };
  return (
    <div className="min-h-screen bg-stone-100">
      <header className="border-b border-brand-800 bg-brand-950 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">Parent portal</p>
            <p className="mt-1 font-display text-xl font-semibold">{institutionName}</p>
            <p className="mt-1 text-xs text-white/55">Signed in as {parentName}</p>
          </div>
          <nav className="flex max-w-full flex-wrap items-center gap-1.5 lg:justify-end" aria-label="Parent portal navigation">
            <Link
              href={withStudent("/parent/dashboard")}
              className={`flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${pathname === "/parent/dashboard" ? "bg-brand-300 text-brand-950" : "text-white/65 hover:bg-white/10 hover:text-white"}`}
            >
              <Home className="h-4 w-4" />Overview
            </Link>
            {navigationGroups.map((group) => {
              const GroupIcon = group.icon;
              const active = group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
              return <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className={`gap-2 px-3 font-medium ${active ? "bg-brand-300 text-brand-950 hover:bg-brand-300 hover:text-brand-950" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                    <GroupIcon className="h-4 w-4" />{group.label}<ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    const itemActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return <DropdownMenuItem key={item.href} asChild className={itemActive ? "bg-brand-50 text-brand-950" : undefined}>
                      <Link href={withStudent(item.href)}><ItemIcon className="mr-2 h-4 w-4" />{item.label}</Link>
                    </DropdownMenuItem>;
                  })}
                </DropdownMenuContent>
              </DropdownMenu>;
            })}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-0.5 shrink-0 border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
                  <UserRound className="mr-2 h-4 w-4" />Account<ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>My account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={withStudent("/parent/profile")}>
                    <UserRound className="mr-2 h-4 w-4" />Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-danger focus:bg-danger/10 focus:text-danger"
                  onClick={async () => {
                    await api.post("/api/auth/logout", {});
                    window.location.replace("/parent-login");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
