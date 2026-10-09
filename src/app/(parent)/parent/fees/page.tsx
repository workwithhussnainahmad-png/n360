import { getStudentFeeAccount } from "@/lib/student-fees";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getParentPortalContext } from "@/lib/parent-access";
import { ParentChildHeader } from "../ParentChildHeader";
import { ParentNoChildren } from "../ParentNoChildren";
import { StudentFeesClient } from "@/app/(student)/student/vouchers/StudentFeesClient";
export default async function ParentFeesPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "PARENT") redirect("/parent-login");
  const context = await getParentPortalContext(session, (await searchParams).student);
  const child = context.selectedChild;
  if (!child) return <ParentNoChildren />;
  const initialData = await getStudentFeeAccount(session.institutionId!, child.id);
  return <div className="space-y-6">
    <ParentChildHeader title="Fees & payments" description="View your child's fees and submit payment evidence for institution verification." students={context.children} selectedStudentId={child.id} path="/parent/fees" />
    <StudentFeesClient key={child.id} studentId={child.id} initialData={initialData} />
  </div>;
}
