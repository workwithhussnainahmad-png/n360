import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const metadata: Metadata = {
  title: "Best LMS Pakistan & School Management Software | Nisaab360",
  description: "Nisaab360 is Pakistan's leading school management software and Learning Management System (LMS). Built specifically for the educational ecosystem in Pakistan.",
  alternates: {
    canonical: "/lms-pakistan",
  },
};

export default function LmsPakistanLanding() {
  return (
    <div className="public-document flex min-h-screen flex-col selection:bg-brand-300 selection:text-brand-950">
      <PublicPageHeader />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 py-12 sm:px-6 md:py-20">
        <div className="mb-14 max-w-4xl border-l-2 border-brand-300 pl-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">Built for education in Pakistan</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.055em] text-brand-950 sm:text-5xl md:text-7xl">
            A complete LMS and school operating system.
          </h1>
          <p className="mb-8 mt-5 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg">
            Tailored specifically for Pakistani schools, colleges, and academies. Automate attendance, fee collection, result generation, and online learning with Nisaab360.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/register">
                Get Started Today <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid w-full border-l border-t border-border md:grid-cols-2">
          <div className="border-b border-r border-border bg-surface p-5 sm:p-8">
            <h2 className="text-2xl font-bold mb-4">Why choose Nisaab360?</h2>
            <ul className="space-y-4">
              {["Built for local fee structures & challans", "WhatsApp & SMS notifications integration", "Urdu/English bilingual support architecture", "Customizable report cards & grading rules"].map((feat, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-500 shrink-0" />
                  <span className="text-stone-700">{feat}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-b border-r border-border bg-brand-100 p-5 sm:p-8">
            <h2 className="text-2xl font-bold mb-4 text-brand-900">Modernize Your Campus</h2>
            <p className="text-brand-800 mb-6">
              Replace outdated desktop software and messy spreadsheets with a cloud-native, real-time dashboard accessible from anywhere in Pakistan.
            </p>
            <Button variant="outline" className="w-full bg-white" asChild>
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
