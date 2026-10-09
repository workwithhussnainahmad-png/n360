import { getStudentFeeAccount } from "@/lib/student-fees";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { StudentFeesClient } from "../vouchers/StudentFeesClient";

export const metadata = {
  title: "Fees | Student",
};

export default async function StudentFeesPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) {
    redirect("/login");
  }

  const initialData = await getStudentFeeAccount(session.institutionId, session.userId);
  return (
    <div className="space-y-10">

      <StudentFeesClient initialData={initialData} />
    </div>
  );
}
