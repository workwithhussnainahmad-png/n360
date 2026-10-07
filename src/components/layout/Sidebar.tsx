"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LucideIcon, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { Button } from "../ui/button";
import { BrandMark, ShellBrand } from "./BrandMark";

export interface SidebarItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** @deprecated Nav no longer hides links via business-data probes. Kept optional for call-site compat. */
  availabilityKey?: "activeStudent" | "studentTests" | "examTimetable" | "fees";
  /** @deprecated Leave badges are loaded on the Leaves page, not on shell mount. */
  notificationKey?: "staffLeaves" | "institutionLeaves";
  hasNotification?: boolean;
}

interface SidebarProps {
  items: SidebarItem[];
  role: string;
  brand: ShellBrand;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ items, role, brand, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [admissionAttentionCount, setAdmissionAttentionCount] = useState(0);

  useEffect(() => {
    if (role !== "INSTITUTION" && role !== "INSTITUTION_ADMIN") return;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/institution/admissions/attention-count", { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { count?: number };
        setAdmissionAttentionCount(Math.max(0, data.count || 0));
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) console.error("Admission badge check failed:", error);
      }
    };
    void load();
    const interval = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    window.addEventListener("admissions:updated", load);
    return () => {
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
      window.removeEventListener("admissions:updated", load);
    };
  }, [role]);

  return (
    <div className="flex h-full flex-col bg-brand-950 text-white">
      <div className={cn("flex h-[68px] items-center justify-between border-b border-white/10", isCollapsed ? "px-4 lg:justify-center" : "px-5")}>
        <Link
          href={brand.href}
          prefetch={false}
          className={cn("flex min-w-0 items-center gap-2", isCollapsed && "lg:justify-center")}
          onClick={onClose}
          title={brand.name}
        >
          <BrandMark brand={brand} />
          <span className={cn("truncate font-display text-lg font-semibold tracking-tight text-white", isCollapsed && "lg:hidden")}>
            {brand.name}
          </span>
        </Link>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white lg:hidden" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className={cn("border-b border-white/10", isCollapsed ? "px-3 py-3" : "px-5 py-3.5")}>
        <span className={cn("text-[10px] font-bold uppercase tracking-[0.16em] text-white/40", isCollapsed && "lg:hidden")}>
          {role.replace('_', ' ')} Portal
        </span>
        {isCollapsed && <span className="hidden text-center text-[10px] font-bold uppercase text-white/40 lg:block">{role.slice(0, 2)}</span>}
      </div>

      <nav className={cn("flex-1 space-y-1 overflow-y-auto overscroll-contain", isCollapsed ? "p-3" : "px-3 py-4")}>
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const itemAttentionCount = item.href === "/institution/admissions" ? admissionAttentionCount : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClose}
              title={isCollapsed ? item.label : undefined}
              className={cn(
                "group flex items-center gap-3 rounded-sm border text-sm font-semibold transition-colors",
                isCollapsed ? "justify-center px-2 py-3" : "px-3 py-3 lg:py-2.5",
                isActive 
                  ? "border-brand-300 bg-brand-300 text-brand-950"
                  : "border-transparent text-white/58 hover:bg-white/7 hover:text-white"
              )}
            >
              <div className="relative">
                <item.icon className={cn("h-[18px] w-[18px] stroke-[1.7px]", isActive ? "text-brand-950" : "text-white/42 group-hover:text-white")} />
                {(item.hasNotification || itemAttentionCount > 0) && (
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-brand-950 bg-red-500"></span>
                  </span>
                )}
              </div>
              <span className={cn(isCollapsed && "lg:hidden")}>{item.label}</span>
              {itemAttentionCount > 0 && <span className={cn("ml-auto min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white", isCollapsed && "lg:hidden")}>{itemAttentionCount > 99 ? "99+" : itemAttentionCount}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/10 p-3 lg:block">
        <Button
          type="button"
          variant="ghost"
          size={isCollapsed ? "icon" : "default"}
          className={cn("w-full gap-2 text-white/50 hover:bg-white/10 hover:text-white", isCollapsed && "px-0")}
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand menu" : "Collapse menu"}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span className={cn(isCollapsed && "hidden")}>Collapse</span>
        </Button>
      </div>
    </div>
  );
}
