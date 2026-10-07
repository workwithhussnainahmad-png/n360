import type { Metadata } from "next";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";
import { LoginForm } from "../login/LoginForm";

export const metadata: Metadata = {
  title: "Parent Login",
  description: "Login to your Nisaab360 parent account.",
  alternates: { canonical: "/parent-login" },
};

export default function ParentLoginPage() {
  return (
    <PublicAccessShell
      title="Parent login"
      description="View every child connected to your guardian email within an institution."
      eyebrow="Family access"
    >
      <LoginForm mode="PARENT" />
    </PublicAccessShell>
  );
}
