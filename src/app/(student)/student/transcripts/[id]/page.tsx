import { db } from "@/db";
import { batchExamResults, batchExamSubjects, batchExams, subjects, institutions } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PrintButton } from "./PrintButton";

export default async function TranscriptDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.userId) redirect("/login");

  const { id } = await params;
  const examId = Number(id);

  const rawResults = await db.select({
    examTitle: batchExams.title,
    examCreatedAt: batchExams.createdAt,
    subjectName: subjects.name,
    maxMarks: batchExamSubjects.maxMarks,
    marksObtained: batchExamResults.marksObtained,
    isPublished: batchExamSubjects.isPublished,
    reviewDeadline: batchExamSubjects.reviewDeadline,
  })
  .from(batchExamResults)
  .innerJoin(batchExamSubjects, eq(batchExamResults.batchExamSubjectId, batchExamSubjects.id))
  .innerJoin(batchExams, eq(batchExamSubjects.batchExamId, batchExams.id))
  .innerJoin(subjects, eq(batchExamSubjects.subjectId, subjects.id))
  .where(
    and(
      eq(batchExamResults.studentId, session.userId),
      eq(batchExams.id, examId)
    )
  );

  const institution = await db.query.institutions.findFirst({
    where: eq(institutions.id, session.institutionId!)
  });
  const signatureKey = institution?.signatureKey;

  if (rawResults.length === 0) {
    return <div className="p-4 sm:p-8 text-center text-stone-500">Transcript not found or unavailable.</div>;
  }

  // Security Check: Make sure it's fully published
  const now = new Date();
  const allPublished = rawResults.every(r => r.isPublished || now > r.reviewDeadline);
  if (!allPublished) {
    return (
      <div className="p-4 sm:p-8 text-center text-amber-600 bg-amber-50 rounded-lg max-w-xl mx-auto mt-8 border border-amber-200">
        This transcript is still pending review from some teachers and is not yet available.
      </div>
    );
  }

  const { examTitle, examCreatedAt } = rawResults[0];
  const totalObtained = rawResults.reduce((acc, r) => acc + r.marksObtained, 0);
  const totalMax = rawResults.reduce((acc, r) => acc + r.maxMarks, 0);
  const overallPercentage = totalMax > 0 ? ((totalObtained / totalMax) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/student/transcripts" prefetch={false}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <PrintButton />
      </div>

      {/* Transcript Document Container */}
      <div className="print-document bg-white border border-stone-200 shadow-sm p-4 sm:p-8 md:p-12 print:shadow-none print:border-none print:p-0">
        
        {/* Header Section */}
        <div className="border-b-2 border-stone-800 pb-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-stone-900 tracking-tight">ACADEMIC TRANSCRIPT</h1>
            <p className="text-stone-600 mt-2 text-sm max-w-md">
              Official record of academic performance for the specified term. This document is valid for internal use and student reference.
            </p>
          </div>
          <div className="text-left md:text-right text-sm text-stone-600">
            <div className="font-semibold text-stone-900 mb-1">{examTitle}</div>
            <div>Issued: {examCreatedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
          </div>
        </div>

        {/* Results Table */}
        <div className="mb-10 overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-stone-300 text-stone-900">
                <th className="py-3 px-2 font-semibold">Subject</th>
                <th className="py-3 px-2 font-semibold text-center w-32">Max Marks</th>
                <th className="py-3 px-2 font-semibold text-center w-32">Obtained</th>
                <th className="py-3 px-2 font-semibold text-right w-32">Percentage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 text-stone-800">
              {rawResults.map((r, i) => {
                const percNum = r.maxMarks > 0 ? (r.marksObtained / r.maxMarks) * 100 : 0;
                return (
                  <tr key={i}>
                    <td className="py-3 px-2">{r.subjectName}</td>
                    <td className="py-3 px-2 text-center text-stone-500">{r.maxMarks}</td>
                    <td className="py-3 px-2 text-center font-medium">{r.marksObtained}</td>
                    <td className="py-3 px-2 text-right">{percNum.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-stone-800 font-bold text-stone-900">
                <td className="py-4 px-2">Total</td>
                <td className="py-4 px-2 text-center">{totalMax}</td>
                <td className="py-4 px-2 text-center">{totalObtained}</td>
                <td className="py-4 px-2 text-right">{overallPercentage}%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Grading Scale & Signatures */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8">
          <div className="text-xs text-stone-500">
            <div className="font-semibold text-stone-700 mb-2 uppercase tracking-wider">Grading Reference</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-w-xs">
              <div className="flex justify-between"><span>A+</span><span>90% - 100%</span></div>
              <div className="flex justify-between"><span>A</span><span>80% - 89%</span></div>
              <div className="flex justify-between"><span>B</span><span>70% - 79%</span></div>
              <div className="flex justify-between"><span>C</span><span>60% - 69%</span></div>
              <div className="flex justify-between"><span>D</span><span>50% - 59%</span></div>
              <div className="flex justify-between"><span>F</span><span>Below 50%</span></div>
            </div>
          </div>
          
          <div className="flex flex-col items-start md:items-end justify-end mt-8 md:mt-0 relative">
            {signatureKey && (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={signatureKey} 
                alt="Principal Signature" 
                className="absolute bottom-6 h-16 w-48 object-contain mix-blend-multiply opacity-90"
              />
            )}
            <div className="w-48 border-b border-stone-400 mb-2 relative z-10"></div>
            <div className="text-sm font-medium text-stone-700 text-center w-48 relative z-10">Principal / Head</div>
            <div className="text-xs text-stone-400 mt-1 w-48 text-center relative z-10">(Electronic Signature)</div>
          </div>
        </div>

      </div>
    </div>
  );
}
