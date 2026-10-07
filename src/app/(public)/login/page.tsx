import { LoginForm } from "./LoginForm";
import { Metadata } from "next";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";

export const metadata: Metadata = {
  title: "Student & Staff Login",
  description: "Login to your Nisaab360 student or staff account.",
  alternates: {
    canonical: "/login",
  },
};

export default function LoginPage() {
  return (
    <PublicAccessShell
      title="Student & staff login"
      description="Access your classroom, timetable, attendance, assessments, and institution updates."
    >
      <LoginForm mode="STUDENT_STAFF" />
    </PublicAccessShell>
  );
}
