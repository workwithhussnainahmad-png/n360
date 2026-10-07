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

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">
          My Fees
        </h1>
        <p className="mt-1 text-stone-500">
          View challans, balances, payment history and receipts.
        </p>
      </div>
      <StudentFeesClient />
    </div>
  );
}
