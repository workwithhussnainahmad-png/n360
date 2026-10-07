import { LoginForm } from "../login/LoginForm";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";

export default function InstitutionLoginPage() {
  return (
    <PublicAccessShell
      title="Institution login"
      description="Manage campuses, staff, students, academics, and daily operations."
      eyebrow="Institution administration"
    >
      <LoginForm mode="INSTITUTION" />
    </PublicAccessShell>
  );
}
