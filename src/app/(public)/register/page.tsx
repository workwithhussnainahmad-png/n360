import { RegistrationForm } from "./RegistrationForm";
import { Metadata } from "next";
import { PublicAccessShell } from "@/components/layout/PublicAccessShell";
import { getPricingPlan } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Register Your Institution",
  description: "Join Nisaab360 and modernize your school management.",
  alternates: {
    canonical: "/register",
  },
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedPlan = typeof params.plan === "string" ? getPricingPlan(params.plan) : undefined;

  return (
    <PublicAccessShell
      title="Register your institution"
      description="Tell us about your institution. The Nisaab360 team will review the request and guide your onboarding."
      eyebrow="Institution registration"
    >
      <div className="mx-auto max-w-2xl">
        <RegistrationForm selectedPlan={requestedPlan?.id} />
      </div>
    </PublicAccessShell>
  );
}
