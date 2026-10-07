import { ClipboardCheck, FileQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnlineTestBuilder } from "@/components/tests/OnlineTestBuilder";
import { db } from "@/db";
import { classes, sections, staffAssignments, subjects } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { HostedTestsList } from "./HostedTestsList";

export default async function StaffTestsPage() {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) redirect("/login");

  const assignedSlots = await db.select({
    sectionId: sections.id,
    sectionName: sections.name,
    className: classes.name,
    subjectId: subjects.id,
    subjectName: subjects.name,
  })
    .from(staffAssignments)
    .innerJoin(sections, eq(staffAssignments.sectionId, sections.id))
    .innerJoin(classes, eq(sections.classId, classes.id))
    .innerJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
    .where(and(eq(staffAssignments.staffId, session.userId), eq(staffAssignments.institutionId, session.institutionId)));

  const sectionOptions = Array.from(new Map(assignedSlots.map((slot) => [slot.sectionId, {
    id: slot.sectionId,
    className: slot.className,
    sectionName: slot.sectionName,
  }])).values());
  const subjectOptions = assignedSlots.map((slot) => ({
    id: slot.subjectId,
    name: slot.subjectName,
    sectionId: slot.sectionId,
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="border-b border-border pb-6">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Teacher hosted tests</p>
        <h1 className="mt-2 text-3xl font-display font-bold text-brand-950">Host Test</h1>
        <p className="mt-1 text-stone-500">Create MCQ-only or Mix tests for your assigned classes and subjects.</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[520px_1fr]">
        <Card className="h-fit">
          <CardHeader className="border-b border-border bg-stone-50/70">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileQuestion className="h-5 w-5 text-brand-700" />
              New Test
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {sectionOptions.length === 0 ? (
              <p className="text-sm text-stone-500">No classes are assigned to your account yet.</p>
            ) : (
              <OnlineTestBuilder sections={sectionOptions} subjects={subjectOptions} />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/70">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ClipboardCheck className="h-5 w-5 text-brand-700" />
                Hosted Tests
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <HostedTestsList />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
