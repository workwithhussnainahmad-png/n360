import { BookOpen, CheckCircle2, Shield, Users } from "lucide-react";

const features = [
  { title: "Administration", icon: Shield, description: "Streamline admissions, fee collection, and record keeping with automated workflows.", benefits: ["Verified fee challans", "Automated roll number generation", "Campus management"] },
  { title: "Academics", icon: BookOpen, description: "Empower teachers with smart grading, attendance tracking, and dynamic timetables.", benefits: ["Auto-grading for MCQs", "Real-time attendance logs", "Syllabus tracking"] },
  { title: "Communication", icon: Users, description: "Keep parents, students, and staff aligned with instant announcements and app notifications.", benefits: ["Push notifications", "Targeted announcements", "Parent portal"] },
];

export function InteractiveFeatures() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 py-24 md:px-12">
      <div className="mb-16 text-center">
        <h2 className="mb-4 font-display text-4xl font-bold tracking-tight text-stone-900 md:text-5xl">Built for human workflows</h2>
        <p className="mx-auto max-w-2xl text-lg text-stone-600">See how Nisaab360 transforms complex daily tasks into simple, elegant experiences.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {features.map(({ title, icon: Icon, description, benefits }) => (
          <article key={title} className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><Icon className="h-6 w-6" /></div>
            <h3 className="font-display text-2xl font-bold text-stone-900">{title}</h3>
            <p className="mt-3 leading-7 text-stone-600">{description}</p>
            <ul className="mt-6 space-y-3">
              {benefits.map((benefit) => <li key={benefit} className="flex gap-2 text-sm font-medium text-stone-600"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{benefit}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
