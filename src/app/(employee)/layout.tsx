import { getSession } from "@/lib/auth";
import { getShellBrandForSession } from "@/lib/shell-brand";
import { redirect } from "next/navigation";
import { EmployeeShell } from "./EmployeeShell";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "EMPLOYEE") redirect("/employee-login");
  const brand = await getShellBrandForSession(session);
  return (
    <EmployeeShell userId={session.userId} initialBrand={brand}>
      {children}
    </EmployeeShell>
  );
}
