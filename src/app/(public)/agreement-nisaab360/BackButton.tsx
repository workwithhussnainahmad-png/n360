"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function BackButton() {
  const router = useRouter();
  
  return (
    <Link 
      href="#" 
      onClick={(e) => {
        e.preventDefault();
        router.back();
      }}
      className="inline-flex items-center text-sm text-stone-500 hover:text-stone-900 transition-colors print:hidden"
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      Back
    </Link>
  );
}
