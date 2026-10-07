import { db } from "@/db";
import { classes, sections, staffAssignments, subjects, staff } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar, Plus, User } from "lucide-react";
import { SectionSelector } from "./SectionSelector";
import { AssignmentForm } from "./AssignmentForm";
import { InchargeForm } from "./InchargeForm";
import { WeeklyTimetable, type TimetableEntry } from "@/components/timetable/ScheduleViews";
import { formatClassSection } from "@/lib/class-section-label";
import Link from "next/link";

type TimetableRow = {
  assignment: typeof staffAssignments.$inferSelect;
  subject: string | null;
  teacher: string | null;
};

const WHOLE_CLASS_SECTION_NAME = "Whole Class";

type TimetableTarget = {
  value: string;
  label: string;
  classId: number;
  sectionId: number | null;
  classTeacherId: number | null;
};

export default async function InstitutionTimetablePage({ searchParams }: { searchParams: Promise<{ sectionId?: string; classId?: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");
  const institutionId = session.institutionId || session.userId;
  const params = await searchParams;

  const [allSections, allSubjects, allStaff, allClasses] = await Promise.all([
    db.select({
      section: sections,
      className: classes.name,
    }).from(sections).innerJoin(classes, eq(sections.classId, classes.id)).where(eq(sections.institutionId, institutionId)),
    db.select().from(subjects).where(eq(subjects.institutionId, institutionId)),
    db.select().from(staff).where(eq(staff.institutionId, institutionId)),
    db.select().from(classes).where(eq(classes.institutionId, institutionId)),
  ]);
  const sectionsByClass = new Map<number, typeof allSections>();
  for (const section of allSections) {
    const classSections = sectionsByClass.get(section.section.classId) || [];
    classSections.push(section);
    sectionsByClass.set(section.section.classId, classSections);
  }

  const timetableTargets: TimetableTarget[] = allClasses.flatMap((classRow) => {
    const classSections = sectionsByClass.get(classRow.id) || [];
    const wholeClassSection = classSections.find((row) => row.section.name === WHOLE_CLASS_SECTION_NAME);
    const namedSections = classSections.filter((row) => row.section.name !== WHOLE_CLASS_SECTION_NAME);

    if (namedSections.length === 0) {
      return [{
        value: `class:${classRow.id}`,
        label: classRow.name,
        classId: classRow.id,
        sectionId: wholeClassSection?.section.id || null,
        classTeacherId: wholeClassSection?.section.classTeacherId || null,
      }];
    }

    return namedSections.map((row) => ({
      value: `section:${row.section.id}`,
      label: formatClassSection(classRow.name, row.section.name),
      classId: classRow.id,
      sectionId: row.section.id,
      classTeacherId: row.section.classTeacherId,
    }));
  });

  const requestedSectionId = params.sectionId ? parseInt(params.sectionId, 10) : null;
  const requestedClassId = params.classId ? parseInt(params.classId, 10) : null;
  const selectedTarget = (
    Number.isInteger(requestedSectionId)
      ? timetableTargets.find((target) => target.sectionId === requestedSectionId)
      : Number.isInteger(requestedClassId)
        ? timetableTargets.find((target) => target.classId === requestedClassId && target.value.startsWith("class:"))
        : null
  ) || timetableTargets[0] || null;

  const selectedSectionId = selectedTarget?.sectionId || null;
  const selectedClassId = selectedTarget?.classId || null;

  let assignments: TimetableRow[] = [];
  if (selectedSectionId) {
    assignments = await db.select({
      assignment: staffAssignments,
      subject: subjects.name,
      teacher: staff.name,
    }).from(staffAssignments)
      .leftJoin(subjects, eq(staffAssignments.subjectId, subjects.id))
      .leftJoin(staff, eq(staffAssignments.staffId, staff.id))
      .where(and(eq(staffAssignments.sectionId, selectedSectionId), eq(staffAssignments.institutionId, institutionId)))
      .orderBy(staffAssignments.startTime);
  }

  const timetableEntries: TimetableEntry[] = assignments.map((row) => {
    const subjectLabel = row.assignment.isBreak ? "Break / Recess" : row.subject || "Subject";
    return {
      id: row.assignment.id,
      dayOfWeek: row.assignment.dayOfWeek,
      startTime: row.assignment.startTime,
      endTime: row.assignment.endTime,
      title: subjectLabel,
      subtitle: row.teacher,
      isBreak: row.assignment.isBreak,
    };
  });

  const subjectOptions = allSubjects.map((s) => ({ id: s.id, name: s.name }));
  const staffOptions = allStaff.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Timetable Manager</h1>
          <p className="text-stone-500 mt-1">Assign teachers, subjects, and timeslots for classes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/institution/timetable/overview"
            className="inline-flex items-center rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-800 transition hover:border-brand-300 hover:bg-brand-100"
          >
            Institution Timetable
          </Link>
          {timetableTargets.length > 0 && (
            <SectionSelector
              sections={timetableTargets.map((target) => ({ value: target.value, label: target.label }))}
              defaultSectionId={selectedTarget?.value || null}
            />
          )}
        </div>
      </div>

      {timetableTargets.length === 0 ? (
        <Card className="p-6 sm:p-12 text-center">
          <Calendar className="h-12 w-12 text-stone-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-brand-900">No Classes Found</h3>
          <p className="text-stone-500 mt-2 max-w-md mx-auto">
            You need to create at least one class in the Academics tab before you can build a timetable.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <WeeklyTimetable
              entries={timetableEntries}
              title="Weekly Schedule"
              emptyTitle="No classes scheduled"
              emptyDescription="Use the form on the right to assign subjects, teachers, and periods."
            />
          </div>

          <div>
            <Card>
              <CardHeader className="border-b border-border bg-stone-50/50 pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-brand-600" />
                  Class Incharge
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                {selectedTarget && (
                  <InchargeForm 
                    key={selectedTarget.value}
                    sectionId={selectedSectionId} 
                    classId={selectedClassId}
                    currentInchargeId={selectedTarget.classTeacherId}
                    staff={staffOptions}
                  />
                )}
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader className="border-b border-border bg-stone-50/50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="h-5 w-5 text-brand-600" />
                  Assign Time Slot
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <AssignmentForm 
                  sectionId={selectedSectionId} 
                  classId={selectedClassId}
                  subjects={subjectOptions}
                  staff={staffOptions}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
