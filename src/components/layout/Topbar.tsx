"use client";

import { Menu, User, LogOut } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { api } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { NotificationCenter } from "@/components/NotificationCenter";
import { ShellBrand } from "./BrandMark";

interface TopbarProps {
  onMenuClick: () => void;
  role: string;
  brand: ShellBrand;
  onLogoutStart?: () => void;
}

export function Topbar({ onMenuClick, role, brand, onLogoutStart }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pathParts = pathname.split("/").filter(Boolean);
  const pageLabel = pathParts.length
    ? pathParts[pathParts.length - 1].replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Dashboard";

  const handleLogout = async () => {
    // Compute redirect URL first, before anything can fail
    const isLocal = window.location.hostname.includes("localhost");
    let loginPath = "/login";
    if (role === "SUPER_ADMIN") loginPath = "/login/super-admin";
    else if (role === "EMPLOYEE") loginPath = "/employee-login";
    else if (role === "INSTITUTION" || role === "INSTITUTION_ADMIN") loginPath = "/institution-login";
    const redirectUrl = isLocal ? loginPath : `https://nisaab360.app${loginPath}`;

    onLogoutStart?.();

    try {
      await api.post("/api/auth/logout", {});
    } catch (err) {
      console.error("Logout API failed:", err);
    }

    // Client-side cookie cleanup (session_exp is not httpOnly, so this works)
    // Delete with both domain variations to cover all cookies
    const past = "expires=Thu, 01 Jan 1970 00:00:00 UTC";
    // Without domain (cookies set before subdomain changes)
    document.cookie = `access_token=; ${past}; path=/;`;
    document.cookie = `refresh_token=; ${past}; path=/;`;
    document.cookie = `session_exp=; ${past}; path=/;`;
    if (!isLocal) {
      // With root domain (cookies set after subdomain changes)
      document.cookie = `access_token=; ${past}; path=/; domain=.nisaab360.app;`;
      document.cookie = `refresh_token=; ${past}; path=/; domain=.nisaab360.app;`;
      document.cookie = `session_exp=; ${past}; path=/; domain=.nisaab360.app;`;
    }

    window.location.replace(redirectUrl);
  };

  return (
    <header className="sticky top-0 z-30 flex h-[68px] shrink-0 items-center justify-between border-b border-border bg-[#f2efe7]/95 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" className="-ml-2 text-stone-700 lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-semibold text-brand-950 sm:text-base">{pageLabel}</p>
          <p className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500 sm:block">
            {brand.name}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <span className="hidden border-r border-border pr-3 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500 md:block">
          {role.replace(/_/g, " ")}
        </span>
        <NotificationCenter />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="border border-border bg-surface">
              <User className="h-5 w-5 text-stone-600" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              let path = "/";
              if (role === "SUPER_ADMIN") path = "/sa/admins";
              else if (role === "INSTITUTION") path = "/institution/settings";
              else if (role === "STAFF") path = "/staff/profile";
              else if (role === "STUDENT" || role === "GRADUATED") path = "/student/profile";
              else path = `/${role.toLowerCase().replace('_', '')}/dashboard`;
              router.push(path);
            }}>
              <User className="mr-2 h-4 w-4" />
              <span>
                {role === "SUPER_ADMIN" ? "Manage Admins" : 
                 role === "INSTITUTION" ? "Settings" : 
                 role === "STAFF" || role === "STUDENT" || role === "GRADUATED" ? "Profile" :
                 "Dashboard"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-danger focus:bg-danger/10 focus:text-danger">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
