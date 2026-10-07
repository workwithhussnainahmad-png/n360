import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function PublicPageHeader({
  backHref = "/",
  backLabel = "Back to home",
}: {
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-[#f2efe7]/95 backdrop-blur-md">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="h-8 w-8 overflow-hidden border border-border bg-white">
            <Image src="/Logo.png" alt="Nisaab360" width={32} height={32} className="h-full w-full object-contain" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-brand-950">Nisaab360</span>
        </Link>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-stone-600 hover:text-brand-950"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{backLabel}</span>
        </Link>
      </div>
    </header>
  );
}
