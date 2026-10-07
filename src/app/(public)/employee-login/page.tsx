import { LoginForm } from "../login/LoginForm";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";

export default function EmployeeLoginPage() {
  return (
    <PublicAccessShell
      title="Employee login"
      description="Open the Nisaab360 platform operations and institution support workspace."
      eyebrow="Platform operations"
    >
      <LoginForm mode="EMPLOYEE" />
    </PublicAccessShell>
  );
}
