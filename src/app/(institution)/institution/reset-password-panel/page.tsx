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
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Reset User Password</h1>
	        <p className="text-stone-500 mt-1">Reset a student or staff member&apos;s password and generate a temporary credential message.</p>
      </div>
      <ResetPasswordForm />
    </div>
  );
}
