import { db } from "@/db";
import { institutions } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, FileSearch } from "lucide-react";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { updateInstitutionStatusAction } from "@/app/actions/employee-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "All" },
] as const;
type StatusFilter = typeof STATUS_FILTERS[number]["value"];

export default async function EmployeeVerificationQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  if (!session || session.role !== "EMPLOYEE") {
    redirect("/login");
  }

  const status: StatusFilter = STATUS_FILTERS.some((f) => f.value === resolvedSearchParams.status)
    ? (resolvedSearchParams.status as StatusFilter)
    : "PENDING";

  // Default to PENDING applications only — the queue employees actually need to
  // act on — instead of loading every institution regardless of status.
  const allInstitutions = await db.select({
    id: institutions.id,
    name: institutions.name,
    username: institutions.username,
    type: institutions.type,
    pricingPlan: institutions.pricingPlan,
    city: institutions.city,
    country: institutions.country,
    status: institutions.status,
    createdAt: institutions.createdAt,
  })
    .from(institutions)
    .where(and(isNull(institutions.parentInstitutionId), status === "ALL" ? undefined : eq(institutions.status, status)))
    .orderBy(desc(institutions.createdAt));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Institutions Queue</h1>
          <p className="text-stone-500 mt-1">Review, verify, and manage institution applications.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-600" />
              Applications
            </CardTitle>
            <div className="flex gap-1 rounded-md bg-stone-100 p-1">
              {STATUS_FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={f.value === "PENDING" ? "/employee/institutions" : `/employee/institutions?status=${f.value}`}
                  prefetch={false}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    status === f.value ? "bg-white text-brand-900 shadow-sm" : "text-stone-600 hover:text-brand-800"
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-medium">Institution Name</th>
                  <th className="px-6 py-4 font-medium">Type</th>
                  <th className="px-6 py-4 font-medium">Plan</th>
                  <th className="px-6 py-4 font-medium">Location</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium">Submitted At</th>
                  <th className="px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allInstitutions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-6 sm:py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-stone-500">
                        <FileSearch className="h-10 w-10 text-stone-300 mb-3" />
                        <p className="text-base font-medium text-stone-600">No Applications</p>
                        <p className="text-sm mt-1">There are currently no institutions in the system.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {allInstitutions.map((inst) => (
                  <tr key={inst.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded bg-brand-100 text-brand-800 flex items-center justify-center font-bold text-xs">
                          {inst.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <Link href={`/employee/institutions/${inst.id}`} prefetch={false} className="font-semibold text-brand-950 hover:underline">
                            {inst.name}
                          </Link>
                          <p className="text-xs text-stone-500">{inst.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-stone-600">{inst.type}</td>
                    <td className="px-6 py-4 text-stone-600 font-medium">
                      {inst.pricingPlan ?? "Not selected"}
                    </td>
                    <td className="px-6 py-4 text-stone-600">{inst.city}, {inst.country}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                        inst.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        inst.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-stone-500">
                      {new Date(inst.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {inst.status === "PENDING" && (
                          <>
                            <form action={async () => {
                              "use server";
                              await updateInstitutionStatusAction(inst.id, "APPROVED");
                            }}>
                              <SubmitButton className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1 text-xs font-medium">Accept</SubmitButton>
                            </form>
                            <form action={async () => {
                              "use server";
                              await updateInstitutionStatusAction(inst.id, "REJECTED");
                            }}>
                              <SubmitButton className="bg-rose-600 hover:bg-rose-700 text-white rounded-md px-3 py-1 text-xs font-medium">Reject</SubmitButton>
                            </form>
                          </>
                        )}
                        
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
