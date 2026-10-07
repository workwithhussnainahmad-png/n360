"use client";

import { AppShell } from "@/components/layout/AppShell";
import type { ShellBrand } from "@/components/layout/BrandMark";
import { LayoutDashboard, Building2, FileText, Star, Ticket, Newspaper, Download, Archive } from "lucide-react";

const SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/employee/dashboard", icon: LayoutDashboard },
  { label: "Verification Queue", href: "/employee/institutions", icon: Building2 },
  { label: "Featured Logos", href: "/employee/featured-institutions", icon: Star },
  { label: "Footer Pages", href: "/employee/pages", icon: FileText },
  { label: "Platform Support", href: "/employee/tickets", icon: Ticket },
  { label: "Blogs", href: "/employee/blogs", icon: Newspaper },
  { label: "Backups", href: "/employee/backups", icon: Archive },
  { label: "Apps", href: "/employee/apps", icon: Download },
];

export function EmployeeShell({
  children,
  userId,
  initialBrand,
}: {
  children: React.ReactNode;
  userId: number;
  initialBrand: ShellBrand;
}) {
  return (
    <AppShell sidebarItems={SIDEBAR_ITEMS} userRole="EMPLOYEE" userId={userId} initialBrand={initialBrand}>
      {children}
    </AppShell>
  );
}
