"use client";

import { cn } from "@/lib/utils";

export type ShellBrand = {
  name: string;
  logoKey: string | null;
  href: string;
  isInstitutionBrand: boolean;
};

interface BrandMarkProps {
  brand: ShellBrand;
  className?: string;
  iconClassName?: string;
}

function isImageUrl(value: string | null) {
  return Boolean(value && (value.startsWith("http://") || value.startsWith("https://")));
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

export function BrandMark({ brand, className, iconClassName }: BrandMarkProps) {
  if (isImageUrl(brand.logoKey)) {
    return (
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logoKey || ""} alt={`${brand.name} logo`} className="h-full w-full object-contain" />
      </span>
    );
  }

  if (brand.isInstitutionBrand) {
    return (
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-sm font-semibold text-brand-900 ring-1 ring-brand-100", className)}>
        {initials(brand.name)}
      </span>
    );
  }

  return (
    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ring-1 ring-brand-100", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/Logo.png" alt="Nisaab360 logo" className={cn("h-full w-full object-contain", iconClassName)} />
    </span>
  );
}
