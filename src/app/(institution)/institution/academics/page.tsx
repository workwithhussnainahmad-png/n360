import { db } from "@/db";
import { subjects, classes, sections } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BookOpen, Plus } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createSubjectAction, createClassAction } from "@/app/actions/institution-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { AddSectionForm } from "./AddSectionForm";
import { displaySectionName } from "@/lib/class-section-label";

export default async function InstitutionAcademicsPage() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }

  const institutionId = session.institutionId || session.userId;

  // Staff options for the class-teacher dropdown are fetched lazily on the client
  // only when the Add Section form is expanded.
  const [allSubjects, allClasses, allSections] = await Promise.all([
    db.select()
      .from(subjects)
      .where(eq(subjects.institutionId, institutionId))
      .orderBy(desc(subjects.createdAt)),
    db.select()
      .from(classes)
      .where(and(eq(classes.institutionId, institutionId), eq(classes.isGraduatedArchive, false)))
      .orderBy(desc(classes.createdAt)),
    db.select({
      section: sections,
      className: classes.name,
    })
      .from(sections)
      .innerJoin(classes, eq(sections.classId, classes.id))
      .where(and(eq(sections.institutionId, institutionId), eq(classes.isGraduatedArchive, false)))
      .orderBy(desc(sections.createdAt)),
  ]);
  const sectionsByClass = new Map<number, typeof allSections>();
  for (const section of allSections) {
    const classSections = sectionsByClass.get(section.section.classId) || [];
    classSections.push(section);
    sectionsByClass.set(section.section.classId, classSections);
  }

  async function createSubject(formData: FormData) {
    "use server";
    await createSubjectAction(formData);
  }

  async function createClass(formData: FormData) {
    "use server";
    await createClassAction(formData);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Academics Setup</h1>
          <p className="text-stone-500 mt-1">Configure subjects, classes, and academic structure.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Subjects List */}
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50 flex flex-row justify-between items-center">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-600" />
              Curriculum Subjects
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Subject Name</th>
                    <th className="px-6 py-4 font-medium">Subject Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allSubjects.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                        No subjects added yet.
                      </td>
                    </tr>
                  )}
                  {allSubjects.map((sub) => (
                    <tr key={sub.id} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-6 py-4 font-semibold text-brand-950">{sub.name}</td>
                      <td className="px-6 py-4 text-stone-600 font-mono">{sub.code || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Add Subject Form */}
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="h-5 w-5 text-brand-600" />
              Add New Subject
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <form action={createSubject} className="space-y-4 pt-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">Subject Name or Names</label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Mathematics, English, Computer Science"
                />
                <p className="mt-1.5 text-xs leading-5 text-stone-500">Separate multiple subjects with commas. Example: Mathematics, English, Computer Science.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Subject Code (Optional, single subject only)</label>
                <input
                  type="text"
                  name="code"
                  className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="e.g. MATH-401"
                />
              </div>
              <SubmitButton
                className="w-full bg-brand-800 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-900 transition-colors"
              >
                Create Subject
              </SubmitButton>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classes List */}
        <Card>
          <CardHeader className="border-b border-border bg-stone-50/50">
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-brand-600" />
              Classes & Sections
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                  <tr>
                    <th className="px-6 py-4 font-medium">Class</th>
                    <th className="px-6 py-4 font-medium">Sections</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allClasses.length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                        No classes added yet.
                      </td>
                    </tr>
                  )}
                  {allClasses.map((cls) => {
                    const clsSections = sectionsByClass.get(cls.id) || [];
                    const visibleSections = clsSections.filter((entry) => displaySectionName(entry.section.name));
                    return (
                      <tr key={cls.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-brand-950">{cls.name}{cls.isFinalClass && <span className="ml-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-800">Final class</span>}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {visibleSections.map(s => (
                              <span key={s.section.id} className="px-2 py-1 bg-brand-100 text-brand-800 text-xs rounded-md font-medium">
                                {displaySectionName(s.section.name)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {/* Add Class Form */}
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand-600" />
                Add New Class
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <form action={createClass} className="space-y-4 pt-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">Class Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="e.g. Grade 10"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-stone-700"><input type="checkbox" name="isFinalClass" /> This is the final graduating class</label>
                <SubmitButton className="w-full bg-brand-800 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-900 transition-colors">
                  Create Class
                </SubmitButton>
              </form>
            </CardContent>
          </Card>

          {/* Add Section Form (Hidden by default since it's optional) */}
          <AddSectionForm classes={allClasses} />
        </div>
      </div>
    </div>
  );
}
