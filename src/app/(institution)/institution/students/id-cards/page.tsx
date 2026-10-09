import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { IdCardsClient } from "./IdCardsClient";

export default async function IdCardsPage({ searchParams }: { searchParams: Promise<{ studentId?: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");

  const params = await searchParams;
  const initialStudentId = params.studentId ? parseInt(params.studentId) : undefined;

  return (
    <div className="space-y-6 animate-fade-in">

      <IdCardsClient initialStudentId={Number.isNaN(initialStudentId) ? undefined : initialStudentId} />
    </div>
  );
}
