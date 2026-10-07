"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";

export function LandingHeader() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#171c1a]/12 bg-[#f2efe7]/94 text-[#171c1a] backdrop-blur-xl">
      <div className="mx-auto flex h-[68px] w-full max-w-[1440px] items-center justify-between px-5 md:px-8">
        <Link href="/" className="group z-50 flex items-center gap-2.5" onClick={closeMenu}>
          <div className="h-8 w-8 flex-shrink-0 overflow-hidden bg-white ring-1 ring-black/10 transition-transform duration-300 group-hover:-rotate-3">
            <Image
              src="/Logo.png"
              alt="Nisaab360 logo"
              width={40}
              height={40}
              quality={80}
              className="h-full w-full object-contain"
            />
          </div>
          <span className="font-display text-[19px] font-bold tracking-[-0.04em]">Nisaab360</span>
        </Link>

        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main navigation">
          {[
            ["Platform", "/#platform"],
            ["Features", "/#features"],
            ["Customers", "/#testimonials"],
            ["Pricing", "/pricing"],
          ].map(([label, href]) => (
            <Link
              key={label}
              href={href}
              className="text-[12px] font-semibold text-[#171c1a]/58 transition-colors hover:text-[#171c1a]"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/download-app"
            className="text-[12px] font-semibold text-[#171c1a]/58 transition-colors hover:text-[#171c1a]"
          >
            Mobile app
          </Link>
          <Link
            href="/download-software"
            className="text-[12px] font-semibold text-[#171c1a]/58 transition-colors hover:text-[#171c1a]"
          >
            Software
          </Link>
        </nav>

        <div className="z-50 flex items-center gap-2.5">
          <Link
            href="/login"
            className="hidden px-2 py-2 text-[12px] font-semibold text-[#171c1a]/65 transition-colors hover:text-[#171c1a] sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="hidden h-9 items-center gap-1.5 bg-[#171c1a] px-4 text-[11px] font-bold text-white transition-colors hover:bg-[#38443f] sm:inline-flex"
          >
            Request access
            <ArrowUpRight size={14} />
          </Link>
          <button
            type="button"
            className="-mr-2 p-2.5 text-[#171c1a]/70 transition-colors hover:bg-black/5 hover:text-[#171c1a] lg:hidden"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            aria-controls="landing-mobile-menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div
          id="landing-mobile-menu"
          className="absolute left-0 top-full w-full border-b border-black/10 bg-[#f2efe7] px-4 pb-5 pt-3 shadow-2xl lg:hidden"
        >
          <nav className="mx-auto flex w-full max-w-lg flex-col" aria-label="Mobile navigation">
            {[
              ["Platform", "/#platform"],
              ["Features", "/#features"],
              ["Customers", "/#testimonials"],
              ["Pricing", "/pricing"],
              ["Download app", "/download-app"],
              ["Download software", "/download-software"],
              ["Employee login", "/employee-login"],
            ].map(([label, href]) => (
              <Link
                key={label}
                href={href}
                onClick={closeMenu}
                className="border-b border-black/8 py-3.5 text-sm font-semibold text-[#171c1a]/65 last:border-0 hover:text-[#171c1a]"
              >
                {label}
              </Link>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/login"
                onClick={closeMenu}
                className="grid h-11 place-items-center border border-black/15 text-sm font-bold text-[#171c1a]"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                onClick={closeMenu}
                className="grid h-11 place-items-center bg-[#171c1a] text-sm font-bold text-white"
              >
                Request access
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
