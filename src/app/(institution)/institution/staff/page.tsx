import { db } from "@/db";
import { campuses, institutionCustomRoles, staff } from "@/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserSquare2 } from "lucide-react";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createStaffAction } from "@/app/actions/institution-actions";
import { AddStaffDialog } from "./AddStaffDialog";
import { DeleteStaffButton } from "./DeleteStaffButton";
import { StaffPageTabs } from "./StaffPageTabs";
import { StaffRoleFilter } from "./StaffRoleFilter";

const STAFF_LIST_LIMIT = 200;

export default async function InstitutionStaffPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) redirect("/login");
  const institutionId = session.institutionId || session.userId;
  const requestedRole = String((await searchParams).role || "all");
  const roleId = Number(requestedRole);
  const roleCondition = requestedRole === "unassigned"
    ? isNull(staff.customRoleId)
    : Number.isInteger(roleId) && roleId > 0
      ? eq(staff.customRoleId, roleId)
      : undefined;

  const [allStaff, allCampuses, allRoles] = await Promise.all([
    db.select({ id: staff.id, name: staff.name, email: staff.email, isActive: staff.isActive, campus: campuses.name, role: institutionCustomRoles.name })
      .from(staff)
      .leftJoin(campuses, eq(staff.campusId, campuses.id))
      .leftJoin(institutionCustomRoles, eq(staff.customRoleId, institutionCustomRoles.id))
      .where(and(eq(staff.institutionId, institutionId), roleCondition))
      .orderBy(desc(staff.createdAt))
      .limit(STAFF_LIST_LIMIT),
    db.select().from(campuses).where(eq(campuses.institutionId, institutionId)),
    db.select().from(institutionCustomRoles).where(eq(institutionCustomRoles.institutionId, institutionId)).orderBy(institutionCustomRoles.name),
  ]);

  async function createStaff(formData: FormData) {
    "use server";
    return createStaffAction(formData);
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-brand-950">Staff Management</h1>
        <p className="mt-1 text-stone-500">Manage teachers, administrators, and support staff.</p>
      </div>

      <StaffPageTabs
        campuses={allCampuses}
        directory={
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><StaffRoleFilter roles={allRoles} value={requestedRole === "unassigned" || allRoles.some((role) => String(role.id) === requestedRole) ? requestedRole : "all"} /><AddStaffDialog campuses={allCampuses} roles={allRoles} createStaff={createStaff} /></div>
            <Card>
              <CardHeader className="border-b border-border bg-stone-50/50">
                <CardTitle className="flex items-center gap-2 text-lg"><UserSquare2 className="h-5 w-5 text-brand-600" />Staff Directory</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border bg-stone-50 text-xs uppercase text-stone-500">
                      <tr><th className="px-6 py-4 font-medium">Name</th><th className="px-6 py-4 font-medium">Email Address</th><th className="px-6 py-4 font-medium">Campus</th><th className="px-6 py-4 font-medium">Role</th><th className="px-6 py-4 font-medium">Status</th><th className="px-6 py-4 text-right font-medium">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {allStaff.length === 0 && <tr><td colSpan={6} className="px-6 py-8 text-center text-stone-500">No staff registered yet.</td></tr>}
                      {allStaff.map((row) => (
                        <tr key={row.id} className="transition-colors hover:bg-stone-50/50">
                          <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">{row.name.substring(0, 2).toUpperCase()}</div><p className="font-semibold text-brand-950">{row.name}</p></div></td>
                          <td className="px-6 py-4 text-stone-600">{row.email}</td>
                          <td className="px-6 py-4 text-stone-500">{row.campus || "Main"}</td>
                          <td className="px-6 py-4 text-stone-500">{row.role || "Unassigned"}</td>
                          <td className="px-6 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.isActive ? "bg-success/20 text-emerald-700" : "bg-danger/20 text-red-700"}`}>{row.isActive ? "Active" : "Disabled"}</span></td>
                          <td className="px-6 py-4"><div className="flex items-center justify-end gap-2"><Link href={`/institution/staff/${row.id}/performance`} className="inline-flex items-center rounded-md border border-stone-300 px-3 py-2 text-xs font-semibold text-brand-800 hover:border-brand-500 hover:bg-brand-50"><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Performance</Link><DeleteStaffButton staffId={row.id} staffName={row.name} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {allStaff.length === STAFF_LIST_LIMIT && <p className="border-t border-border bg-stone-50/50 px-6 py-3 text-xs text-stone-500">Showing the first {STAFF_LIST_LIMIT} staff members. Refine roles/campuses in Settings to narrow this down.</p>}
              </CardContent>
            </Card>
          </div>
        }
      />
    </div>
  );
}
