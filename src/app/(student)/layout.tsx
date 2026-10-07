import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudentShell } from "./StudentShell";
import { getShellBrandForSession } from "@/lib/shell-brand";
import { getInstitutionCourseStreamingHint } from "@/lib/course-streaming";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session || session.role !== "STUDENT") redirect("/login");
  const institutionId = session.institutionId;
  const [brand, coursesEnabled] = await Promise.all([
    getShellBrandForSession(session),
    institutionId
      ? getInstitutionCourseStreamingHint(institutionId)
      : Promise.resolve(false),
  ]);
  return (
    <StudentShell
      isGraduated={session.studentAcademicStatus === "GRADUATED"}
      userId={session.userId}
      institutionId={institutionId}
      initialBrand={brand}
      coursesEnabled={coursesEnabled}
    >
      {children}
    </StudentShell>
  );
}
