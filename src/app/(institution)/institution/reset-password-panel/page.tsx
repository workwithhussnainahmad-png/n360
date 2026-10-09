import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPanelPage() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">

      <ResetPasswordForm />
    </div>
  );
}
