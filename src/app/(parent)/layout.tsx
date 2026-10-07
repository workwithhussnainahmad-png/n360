import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { parentAccounts } from "@/db/schema";
import { institutions } from "@/db/schema";
import { ParentShell } from "./ParentShell";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  if (!session.institutionId) redirect("/parent-login");
  // Parent pages contain child data. Recheck the account on every server render
  // so an institution's guardian correction takes effect immediately instead of
  // waiting for the signed web token to expire.
  const [parent] = await db
    .select({ id: parentAccounts.id, name: parentAccounts.name, email: parentAccounts.email, institutionName: institutions.name })
    .from(parentAccounts)
    .innerJoin(institutions, eq(parentAccounts.institutionId, institutions.id))
    .where(and(
      eq(parentAccounts.id, session.userId),
      eq(parentAccounts.institutionId, session.institutionId),
      ne(parentAccounts.status, "DISABLED"),
    ))
    .limit(1);
  if (!parent) redirect("/parent-login");
  return (
    <ParentShell institutionName={parent.institutionName} parentName={parent.name || parent.email}>
      {children}
    </ParentShell>
  );
}
