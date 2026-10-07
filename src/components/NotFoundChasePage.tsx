"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, Home, SearchX } from "lucide-react";

function missingWordFromPath(pathname: string | null, fallbackWord: string) {
  const parts = (pathname || "").split("/").filter(Boolean);
  const last = parts.at(-1);

  if (!last) return fallbackWord;

  try {
    return decodeURIComponent(last).replace(/[-_]+/g, " ");
  } catch {
    return last.replace(/[-_]+/g, " ");
  }
}

export function NotFoundChasePage({ fallbackWord }: { fallbackWord: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryWord = searchParams.get("q") || searchParams.get("search");
  const missingWord = queryWord?.trim() || missingWordFromPath(pathname, fallbackWord);

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4 py-6 sm:py-10">
      <section className="w-full max-w-5xl overflow-hidden rounded-xl border border-border bg-white shadow-sm">
        <div className="grid min-h-[560px] lg:grid-cols-[0.95fr_1.05fr]">
          <div className="flex flex-col justify-center border-b border-border p-4 sm:p-8 sm:p-10 lg:border-b-0 lg:border-r">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-900 text-white">
              <SearchX className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-700">404 Not Found</p>
            <h1 className="mt-4 text-4xl font-display font-bold text-brand-950 sm:text-5xl">
              We could not catch that page.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-stone-600">
              The page you tried to open does not exist or may have been moved. Our runner is still chasing it.
            </p>
            <div className="mt-6 rounded-lg border border-border bg-stone-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Missing target</p>
              <p className="mt-1 truncate font-mono text-lg font-semibold text-brand-950">/{missingWord}</p>
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-800 px-4 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand-900 hover:shadow-md"
              >
                <Home className="h-4 w-4" />
                Back to Home
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-4 text-sm font-medium text-brand-900 shadow-sm transition-colors hover:bg-stone-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Go to Login
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center bg-white p-6 sm:p-10">
            <div className="notfound-stage" aria-hidden="true">
              <div className="notfound-chase-lane">
                <div className="notfound-word" title={missingWord}>
                  {missingWord}
                </div>
                <div className="notfound-motion-line notfound-motion-one" />
                <div className="notfound-motion-line notfound-motion-two" />
                <div className="notfound-runner">
                  <span className="notfound-head" />
                  <span className="notfound-body" />
                  <span className="notfound-arm notfound-arm-front" />
                  <span className="notfound-arm notfound-arm-back" />
                  <span className="notfound-leg notfound-leg-front" />
                  <span className="notfound-leg notfound-leg-back" />
                </div>
                <div className="notfound-ground" />
                <div className="notfound-dust notfound-dust-one" />
                <div className="notfound-dust notfound-dust-two" />
                <div className="notfound-dust notfound-dust-three" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
