import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { FeesManager } from "./FeesManager";

export const metadata = { title: "Fees & Collections | Institution" };

const sections = [
  {
    key: "setup",
    label: "Fee structure",
    description: "Set fee heads and class amounts",
  },
  {
    key: "billing",
    label: "Monthly billing",
    description: "Create challans and adjustments",
  },
  {
    key: "collections",
    label: "Collections",
    description: "Find dues and record payments",
  },
  {
    key: "paid",
    label: "Paid fees / challans",
    description: "Recent verified and fully paid challans",
  },
] as const;

export default async function InstitutionFeesPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await getSession();
  if (!session || !["INSTITUTION", "INSTITUTION_ADMIN"].includes(session.role))
    redirect("/login");
  const requestedSection = (await searchParams).section;
  const section = sections.some((item) => item.key === requestedSection)
    ? (requestedSection as (typeof sections)[number]["key"])
    : "setup";

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">
          Accounts desk
        </p>
        <h1 className="mt-1 text-3xl font-display font-bold leading-tight text-brand-950">
          Fees & Collections
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500 sm:text-base">
          Set class fees, issue monthly challans, and record payments without
          loading unrelated records.
        </p>
      </div>
      <nav
        aria-label="Fee sections"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {sections.map((item) => (
          <Link
            key={item.key}
            href={`/institution/fees?section=${item.key}`}
            scroll={false}
            className={`rounded-xl border p-4 text-left transition ${section === item.key ? "border-brand-600 bg-brand-950 text-white shadow-sm" : "border-stone-200 bg-white text-stone-800 hover:border-brand-300"}`}
          >
            <span className="block text-sm font-bold">{item.label}</span>
            <span
              className={`mt-1 block text-xs leading-5 ${section === item.key ? "text-white/70" : "text-stone-500"}`}
            >
              {item.description}
            </span>
          </Link>
        ))}
      </nav>
      <FeesManager mode={section} />
    </div>
  );
}
