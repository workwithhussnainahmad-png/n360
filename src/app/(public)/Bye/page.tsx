import type { Metadata } from "next";
import Link from "next/link";
import { Download, HeartCrack, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const metadata: Metadata = {
  title: "Goodbye from Nisaab360",
  description: "Nisaab360 has been uninstalled. Thank you for using our institution management platform.",
  alternates: { canonical: "/Bye" },
  robots: { index: false, follow: true },
};

export default function ByePage() {
  return (
    <div className="public-document min-h-screen">
      <PublicPageHeader backHref="/" backLabel="Back to home" />
      <main className="flex-1 overflow-hidden">
        <section className="border-b border-stone-800 bg-stone-950 px-5 py-16 text-white sm:px-6 sm:py-24">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center bg-stone-800 text-stone-200">
              <HeartCrack className="h-6 w-6" />
            </div>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">Uninstall complete</p>
            <h1 className="mt-4 font-display text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
              Goodbye, and thank you for using Nisaab360.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
              We are sorry to see you go. Your local desktop data has been removed with the app. If you ever need Nisaab360 again, you can reinstall anytime.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-4xl border-l border-t border-border bg-surface p-5 sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-xl font-bold text-stone-950">Changed your mind?</h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              You can download the latest Nisaab360 desktop app again and sign in with your institution credentials to resume where you left off.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/download-app">
                  <Download className="mr-2 h-4 w-4" />
                  Reinstall Nisaab360
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Back to homepage
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
