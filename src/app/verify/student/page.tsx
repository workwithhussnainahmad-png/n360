import type { Metadata } from "next";
import { Suspense } from "react";
import { StudentVerificationClient } from "./StudentVerificationClient";

export const metadata: Metadata = {
  title: "Student verification",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: "/verify/student" },
};

export default function StudentVerificationPage() {
  return <Suspense fallback={<div style={{ padding: 32 }}>Checking student card...</div>}><StudentVerificationClient /></Suspense>;
}
