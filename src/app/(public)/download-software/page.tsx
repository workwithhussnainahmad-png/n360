import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Download, Monitor, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const metadata: Metadata = {
  title: "Download Nisaab360 Software",
  description: "Download the official Nisaab360 desktop software.",
  alternates: { canonical: "/download-software" },
};

export default function DownloadSoftwarePage() {
  return (
    <div className="public-document min-h-screen">
      <PublicPageHeader />
      <main className="flex-1 overflow-hidden">
        <section className="border-b border-brand-800 bg-brand-950 px-5 py-16 text-white sm:px-6 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <div className="flex h-12 w-12 items-center justify-center bg-brand-300 text-brand-950"><Monitor className="h-6 w-6" /></div>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">Official Nisaab360 software</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">Your school, ready at your desk.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">Download the official desktop software for a complete Nisaab360 experience.</p>
          </div>
        </section>
        <section className="mx-auto grid max-w-5xl border-l border-t border-border lg:grid-cols-[1.35fr_0.65fr]">
          <div className="border-b border-r border-border bg-surface p-5 sm:p-8 lg:p-10">
            <h2 className="text-2xl font-bold tracking-tight text-stone-950">Download the official software</h2>
            <p className="mt-3 max-w-2xl leading-7 text-stone-600">Use the button below to download the latest Nisaab360 software directly from our official source.</p>
            <Button asChild size="lg" className="mt-7"><Link href="/api/download-software"><Download className="mr-2 h-5 w-5" />Download Nisaab360 Software</Link></Button>
            <p className="mt-4 flex items-center gap-2 text-sm text-stone-500"><ShieldCheck className="h-4 w-4 text-success" />Download only from this official Nisaab360 page.</p>
          </div>
          <aside className="border-b border-r border-border bg-[#e9e5dc] p-5 sm:p-7">
            <h2 className="text-lg font-bold text-stone-950">Before you install</h2>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-stone-600">
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />Use the credentials provided by your institution.</li>
              <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />Keep your software updated for the latest improvements.</li>
            </ul>
          </aside>
        </section>
      </main>
    </div>
  );
}
