import { actionFeedback } from '@/lib/action-feedback';
import { ActionForm } from '@/components/ui/action-form';
export const dynamic = "force-dynamic";
import { db } from "@/db";
import { institutions } from "@/db/schema";
import { desc, count, isNull } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Building2, Search, ChevronLeft, ChevronRight } from "lucide-react";

import { updateInstitutionStatusAction } from "@/app/actions/sa-actions";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";

const PAGE_SIZE = 50;

export default async function SAInstitutionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const page = Math.max(parseInt(resolvedSearchParams.page || "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [allInstitutions, totalCountRows] = await Promise.all([
    db.select({
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
      .where(isNull(institutions.parentInstitutionId))
      .orderBy(desc(institutions.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db.select({ value: count() }).from(institutions).where(isNull(institutions.parentInstitutionId)),
  ]);
  const totalCount = totalCountRows[0].value;
  const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

  async function updateStatus(formData: FormData) {
    "use server";
    return actionFeedback(async () => {
    const id = parseInt(formData.get("id") as string, 10);
    const status = formData.get("status") as "PENDING" | "APPROVED" | "REJECTED";
    await updateInstitutionStatusAction(id, status);
    redirect("/sa/institutions");

    });
  }

  return (
    <div className="space-y-8 animate-fade-in">

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand-600" />
              School Requests
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
              <input
                type="text"
                placeholder="Search institutions..."
                className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all"
                disabled
              />
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
                  <th className="px-6 py-4 font-medium">Registered At</th>
                  <th className="px-6 py-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allInstitutions.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                      No institutions found.
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
                          <Link href={`/sa/institutions/${inst.id}`} prefetch={false} className="font-semibold text-brand-950 hover:underline">
                            {inst.name}
                          </Link>
                          <p className="text-xs text-stone-500">{inst.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-stone-600 font-medium">{inst.type}</td>
                    <td className="px-6 py-4 text-stone-600 font-medium">
                      {inst.pricingPlan ?? "Not selected"}
                    </td>
                    <td className="px-6 py-4 text-stone-600">
                      {inst.city}, {inst.country}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                        inst.status === 'PENDING' ? 'bg-warning/20 text-yellow-700' :
                        inst.status === 'APPROVED' ? 'bg-success/20 text-emerald-700' :
                        'bg-danger/20 text-red-700'
                      }`}>
                        {inst.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-stone-500">
                      {new Date(inst.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {inst.status !== 'APPROVED' && (
                          <ActionForm action={updateStatus}>
                            <input type="hidden" name="id" value={inst.id} />
                            <input type="hidden" name="status" value="APPROVED" />
                            <SubmitButton variant="outline" size="sm" className="text-success hover:text-success hover:bg-success/10 h-7 text-xs" loadingText="Approving...">
                              Approve
                            </SubmitButton>
                          </ActionForm>
                        )}
                        {inst.status !== 'REJECTED' && (
                          <ActionForm action={updateStatus}>
                            <input type="hidden" name="id" value={inst.id} />
                            <input type="hidden" name="status" value="REJECTED" />
                            <SubmitButton variant="outline" size="sm" className="text-danger hover:text-danger hover:bg-danger/10 h-7 text-xs" loadingText="Rejecting...">
                              Reject
                            </SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalCount > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-sm text-stone-500">
                Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, totalCount)} of {totalCount} institutions
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/sa/institutions?page=${Math.max(page - 1, 1)}`}
                  prefetch={false}
                  aria-disabled={page <= 1}
                  className={`inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors ${
                    page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-stone-50 text-stone-700"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </Link>
                <span className="px-2 py-1.5 text-sm text-stone-500">Page {page} of {totalPages}</span>
                <Link
                  href={`/sa/institutions?page=${Math.min(page + 1, totalPages)}`}
                  prefetch={false}
                  aria-disabled={page >= totalPages}
                  className={`inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors ${
                    page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-stone-50 text-stone-700"
                  }`}
                >
                  Next <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
