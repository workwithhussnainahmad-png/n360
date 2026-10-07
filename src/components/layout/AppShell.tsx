"use client";

import React, { useState } from "react";
import { Sidebar, SidebarItem } from "./Sidebar";
import { Topbar } from "./Topbar";
import { ShellBrand } from "./BrandMark";
import { cn } from "@/lib/utils";
import { clearShellClientCache, writeShellClientCache, shellCacheKey } from "@/lib/shell-client-cache";

interface AppShellProps {
  children: React.ReactNode;
  sidebarItems: SidebarItem[];
  userRole: string;
  /** Optional stable ids for scoped client brand cache (safe metadata only). */
  userId?: number;
  institutionId?: number | null;
  /** When provided by an RSC layout, skip the /api/me/brand client round-trip. */
  initialBrand?: ShellBrand;
}

const DEFAULT_BRAND: ShellBrand = {
  name: "Nisaab360",
  logoKey: null,
  href: "/",
  isInstitutionBrand: false,
};

export function AppShell({
  children,
  sidebarItems,
  userRole,
  userId,
  institutionId,
  initialBrand,
}: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [brand] = useState<ShellBrand>(() => initialBrand ?? DEFAULT_BRAND);

  React.useEffect(() => {
    if (!initialBrand || userId == null) return;
    writeShellClientCache(
      shellCacheKey({ role: userRole, userId, institutionId, key: "brand" }),
      initialBrand
    );
  }, [initialBrand, userId, institutionId, userRole]);

  return (
    <div className="app-shell flex min-h-dvh text-foreground">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-brand-950/55 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 transform border-r border-brand-800 bg-brand-950 transition-[width,transform] duration-200 ease-out lg:translate-x-0",
          isSidebarCollapsed ? "lg:w-20" : "lg:w-64",
          "w-[min(17rem,88vw)]",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar
          items={sidebarItems}
          role={userRole}
          brand={brand}
          onClose={() => setIsSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((current) => !current)}
        />
      </div>

      <div className={cn("flex min-h-dvh min-w-0 flex-1 flex-col transition-[margin] duration-200", isSidebarCollapsed ? "lg:ml-20" : "lg:ml-64")}>
        <Topbar
          onMenuClick={() => setIsSidebarOpen(true)}
          role={userRole}
          brand={brand}
          onLogoutStart={clearShellClientCache}
        />

        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-9">
          <div className="app-content min-h-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
