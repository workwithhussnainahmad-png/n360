import { BookOpen, Loader2 } from "lucide-react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function BlogLoadingSkeleton() {
  return (
    <div className="min-h-screen flex flex-col bg-[#FDFCFB] selection:bg-brand-500 selection:text-white">
      <header className="sticky top-0 z-50 flex items-center px-6 md:px-12 py-4 backdrop-blur-2xl bg-white/60 border-b border-stone-200/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-stone-200 animate-pulse"></div>
          <div className="h-6 w-24 bg-stone-200 rounded animate-pulse"></div>
        </div>
        <div className="ml-auto h-5 w-24 bg-stone-200 rounded animate-pulse"></div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16 md:py-24">
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-stone-900 mb-4 flex items-center gap-3">
            <BookOpen className="w-10 h-10 text-stone-200 animate-pulse" />
            <div className="h-12 w-48 bg-stone-200 rounded animate-pulse"></div>
          </h1>
          <div className="h-6 w-96 bg-stone-200 rounded animate-pulse"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-stone-100 flex flex-col h-64 overflow-hidden">
              <div className="p-4 sm:p-8 flex-1 space-y-4">
                <div className="h-8 w-3/4 bg-stone-200 rounded animate-pulse"></div>
                <div className="space-y-2">
                  <div className="h-4 w-full bg-stone-200 rounded animate-pulse"></div>
                  <div className="h-4 w-full bg-stone-200 rounded animate-pulse"></div>
                  <div className="h-4 w-2/3 bg-stone-200 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="px-4 sm:px-8 py-4 bg-stone-50/50 border-t border-stone-100/50 flex justify-between items-center">
                <div className="h-4 w-24 bg-stone-200 rounded animate-pulse"></div>
                <div className="h-4 w-24 bg-stone-200 rounded animate-pulse"></div>
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="w-full bg-white border-t border-stone-200 py-6 sm:py-10 px-6 text-center">
        <div className="h-4 w-64 bg-stone-200 rounded animate-pulse mx-auto"></div>
      </footer>
    </div>
  );
}
