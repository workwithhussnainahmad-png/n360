import type { Metadata } from "next";
import { BookOpen, CheckCircle2, Monitor, Wifi } from "lucide-react";
import { PublicPageHeader } from "@/components/layout/PublicPageHeader";

export const metadata: Metadata = {
  title: "Thank You for Installing Nisaab360",
  description: "Installation complete. Quick guide to sign in, sync institution data, and use Nisaab360 Institution Panel.",
  alternates: { canonical: "/Thanks" },
  robots: { index: false, follow: true },
};

const guideSteps = [
  {
    icon: Monitor,
    title: "Open the desktop app",
    text: "Launch Nisaab360 from your desktop shortcut or Start menu.",
  },
  {
    icon: BookOpen,
    title: "Sign in with institution credentials",
    text: "Use the same admin email and password you use on the web institution panel.",
  },
  {
    icon: Wifi,
    title: "Complete the first sync online",
    text: "On first login, the app downloads campuses, students, staff, and settings to your local database.",
  },
  {
    icon: CheckCircle2,
    title: "Work offline when needed",
    text: "After sync, most screens load instantly from local data. Changes made offline are queued and pushed when internet returns.",
  },
];

export default function ThanksPage() {
  return (
    <div className="public-document min-h-screen">
      <PublicPageHeader backHref="/download-app" backLabel="Download page" />
      <main className="flex-1 overflow-hidden">
        <section className="border-b border-brand-800 bg-brand-950 px-5 py-16 text-white sm:px-6 sm:py-24">
          <div className="mx-auto max-w-5xl">
            <div className="flex h-12 w-12 items-center justify-center bg-brand-300 text-brand-950">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">Installation complete</p>
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
              Thank you for installing Nisaab360.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/55 sm:text-lg">
              Your institution desktop app is ready. Follow the quick guide below to sign in, sync data, and start managing your campuses with confidence.
            </p>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl gap-0 border-l border-t border-border lg:grid-cols-[1.35fr_0.65fr]">
          <div className="border-b border-r border-border bg-surface p-5 sm:p-8 lg:p-10">
            <h2 className="text-2xl font-bold tracking-tight text-stone-950">Quick start guide</h2>
            <p className="mt-3 max-w-2xl leading-7 text-stone-600">
              These steps help you get productive in minutes after installation.
            </p>

            <ol className="mt-8 space-y-5">
              {guideSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="flex gap-4 border-l-2 border-brand-200 pl-4">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center bg-brand-50 text-brand-800">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-stone-400">Step {index + 1}</p>
                      <h3 className="mt-1 font-semibold text-stone-950">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{step.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

          </div>

          <aside className="border-b border-r border-border bg-[#e9e5dc] p-5 sm:p-7">
            <h2 className="text-lg font-bold text-stone-950">Need help?</h2>
            <ul className="mt-5 space-y-4 text-sm leading-6 text-stone-600">
              <li>If sync fails, check internet connection and sign in again.</li>
              <li>Use the same campus filters and modules you already know from the web panel.</li>
              <li>For support, contact your institution administrator or Nisaab360 support team.</li>
            </ul>
            <div className="mt-7 border-t border-stone-300/70 pt-6 text-sm text-stone-500">
              You can close this page and return to the desktop app anytime.
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
