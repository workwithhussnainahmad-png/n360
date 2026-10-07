import React from "react";

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-[#FDFCFB]" aria-hidden="true">
      <div className="absolute -top-40 right-[-10%] h-[38rem] w-[38rem] rounded-full bg-brand-100/30" />
      <div className="absolute bottom-[-18rem] left-[-12rem] h-[34rem] w-[34rem] rounded-full bg-indigo-100/25" />
    </div>
  );
}

export function FloatingIcons() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-1 overflow-hidden" aria-hidden="true">
      <div className="absolute left-[10%] top-[20%] rounded-2xl border border-stone-100 bg-white p-4 shadow-xl shadow-brand-500/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-600">+</div>
      </div>
      <div className="absolute right-[10%] top-[15%] rounded-2xl border border-stone-100 bg-white p-4 shadow-xl shadow-amber-500/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600">★</div>
      </div>
    </div>
  );
}
