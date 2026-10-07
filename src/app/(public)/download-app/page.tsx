import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Download, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const metadata: Metadata = {
  title: "Download Nisaab360 for Android | School Management App",
  description: "Download the official Nisaab360 Android app for secure access to attendance, marks, timetables, announcements, and school management tools.",
  keywords: ["Nisaab360 Android app", "school management app Pakistan", "LMS Android app", "student attendance app", "download Nisaab360"],
  alternates: { canonical: "/download-app" },
  openGraph: {
    title: "Download Nisaab360 for Android",
    description: "The official school management app for Nisaab360 institutions, staff, students, and families.",
    url: "/download-app",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Download Nisaab360 for Android",
    description: "Access attendance, marks, timetables, and school updates on the go.",
  },
  robots: { index: true, follow: true },
};

export default function DownloadAppPage() {
  return (
    <div className="public-document min-h-screen">
      <PublicPageHeader />
      <main className="flex-1 overflow-hidden">
      <section className="border-b border-brand-800 bg-brand-950 px-5 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="flex h-12 w-12 items-center justify-center bg-brand-300 text-brand-950">
            <Smartphone className="h-6 w-6" />
          </div>
          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">Official Nisaab360 Android app</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">Your school, connected wherever you are.</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
            Stay connected to attendance, marks, timetables, announcements, and the important updates that keep your institution moving.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-0 border-l border-t border-border lg:grid-cols-[1.35fr_0.65fr]">
        <div className="border-b border-r border-border bg-surface p-5 sm:p-8 lg:p-10">
          <div className="border-l-2 border-success bg-emerald-50 p-5 text-emerald-950">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              <div>
                <h2 className="font-bold">Google Play release in progress</h2>
                <p className="mt-1 text-sm leading-6 text-emerald-900">
                  The Nisaab360 Mobile App is currently completing its Google Play testing phase. The Play Store release will be available shortly. You may wait for the official listing or install the current verified Android package now.
                </p>
              </div>
            </div>
          </div>

          <h2 className="mt-8 text-2xl font-bold tracking-tight text-stone-950">Download the official Android app</h2>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">
            Use the button below to download the latest Nisaab360 APK directly from our official website. This package is intended for Android devices.
          </p>
          <Button asChild size="lg" className="mt-7">
            <Link href="/api/download-app">
              <Download className="mr-2 h-5 w-5" />
              Download Nisaab360 App
            </Link>
          </Button>
          <p className="mt-4 flex items-center gap-2 text-sm text-stone-500"><ShieldCheck className="h-4 w-4 text-success" /> Download only from this official Nisaab360 page.</p>
        </div>

        <aside className="border-b border-r border-border bg-[#e9e5dc] p-5 sm:p-7">
          <h2 className="text-lg font-bold text-stone-950">What you can do</h2>
          <ul className="mt-5 space-y-4 text-sm leading-6 text-stone-600">
            {[
              "View timetable and school announcements.",
              "Keep track of attendance, marks, and results.",
              "Access essential academic updates on the go.",
            ].map((item) => (
              <li key={item} className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />{item}</li>
            ))}
          </ul>
          <div className="mt-7 border-t border-stone-100 pt-6 text-sm text-stone-500">
            Already use Nisaab360? Sign in with the credentials provided by your institution after installation.
          </div>
        </aside>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Nisaab360 Mobile App",
          operatingSystem: "Android",
          applicationCategory: "EducationalApplication",
          downloadUrl: "https://nisaab360.app/api/download-app",
          description: "Official Nisaab360 Android app for attendance, marks, timetables, and school updates.",
        }) }}
      />
      </main>
    </div>
  );
}
