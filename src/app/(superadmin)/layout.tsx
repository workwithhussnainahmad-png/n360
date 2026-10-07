import { getSession } from "@/lib/auth";
import { getShellBrandForSession } from "@/lib/shell-brand";
import { redirect } from "next/navigation";
import { SuperAdminShell } from "./SuperAdminShell";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");
  const brand = await getShellBrandForSession(session);
  return (
    <SuperAdminShell userId={session.userId} initialBrand={brand}>
      {children}
    </SuperAdminShell>
  );
}
