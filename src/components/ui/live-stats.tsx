import { FileText, School, Users } from "lucide-react";

function format(value: number) {
  return value > 1000 ? `${(value / 1000).toFixed(1).replace(".0", "")}k+` : value.toLocaleString();
}

export function LiveStats({ stats }: { stats: { institutions: number; students: number; tests: number } }) {
  const items = [
    { value: stats.institutions, label: "Active Institutions", icon: School },
    { value: stats.students, label: "Students Enrolled", icon: Users },
    { value: stats.tests, label: "Exams Conducted", icon: FileText },
  ];

  return (
    <section className="relative w-full overflow-hidden border-y border-stone-200 bg-stone-50 py-20">
      <div className="relative z-10 mx-auto max-w-7xl px-6 md:px-12">
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.2em] text-brand-600">Platform usage</p>
          <h2 className="font-display text-3xl font-bold text-stone-900 md:text-4xl">Powering education globally</h2>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-10">
          {items.map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center justify-center rounded-3xl border border-stone-100 bg-white p-6 shadow-lg">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><Icon className="h-7 w-7" /></div>
              <div className="mb-2 font-display text-4xl font-extrabold tracking-tight text-stone-900 md:text-5xl">{format(value)}</div>
              <div className="text-sm font-medium uppercase tracking-widest text-stone-700">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
