import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PublicAccessShell({
  title,
  description,
  eyebrow = "Nisaab360 secure access",
  children,
  compact = false,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="public-canvas flex min-h-[100svh] flex-col">
      <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-border px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden border border-border bg-white">
            <Image src="/Logo.png" alt="Nisaab360" width={32} height={32} className="h-full w-full object-contain" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-brand-950">Nisaab360</span>
        </Link>
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-stone-600 hover:text-brand-950">
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to home</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className={`mx-auto w-full ${compact ? "max-w-lg" : "max-w-5xl"}`}>
          <div className="mb-7 border-l-2 border-brand-300 pl-4 sm:mb-9">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-brand-700">{eyebrow}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.045em] text-brand-950 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">{description}</p>
          </div>
          {children}
        </div>
      </main>

      <footer className="border-t border-border px-4 py-4 text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
        © {new Date().getFullYear()} Nisaab360 · Secure education platform
      </footer>
    </div>
  );
}
