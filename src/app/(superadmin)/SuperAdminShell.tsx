"use client";

import { AppShell } from "@/components/layout/AppShell";
import type { ShellBrand } from "@/components/layout/BrandMark";
import { LayoutDashboard, Building2, Users, Activity, ShieldAlert, FileText, Star, Newspaper, Download, Archive } from "lucide-react";

const SIDEBAR_ITEMS = [
  { label: "Dashboard", href: "/sa/dashboard", icon: LayoutDashboard },
  { label: "School Requests", href: "/sa/institutions", icon: Building2 },
  { label: "Institution Backups", href: "/sa/backups", icon: Archive },
  { label: "Featured Logos", href: "/sa/featured-institutions", icon: Star },
  { label: "Platform Support", href: "/sa/tickets", icon: Activity },
  { label: "Employees", href: "/sa/employees", icon: Users },
  { label: "System Admins", href: "/sa/admins", icon: ShieldAlert },
  { label: "Audit Logs", href: "/sa/audit", icon: Activity },
  { label: "Footer Pages", href: "/sa/pages", icon: FileText },
  { label: "Blogs", href: "/sa/blogs", icon: Newspaper },
  { label: "Apps", href: "/sa/apps", icon: Download },
];

export function SuperAdminShell({
  children,
  userId,
  initialBrand,
}: {
  children: React.ReactNode;
  userId: number;
  initialBrand: ShellBrand;
}) {
  return (
    <AppShell sidebarItems={SIDEBAR_ITEMS} userRole="SUPER_ADMIN" userId={userId} initialBrand={initialBrand}>
      {children}
    </AppShell>
  );
}
