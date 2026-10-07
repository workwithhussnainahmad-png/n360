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
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Student ID Cards</h1>
        <p className="mt-1 text-stone-500">Search students, preview cards, then print. Cards always reflect the latest class and section.</p>
      </div>
      <IdCardsClient initialStudentId={Number.isNaN(initialStudentId) ? undefined : initialStudentId} />
    </div>
  );
}
