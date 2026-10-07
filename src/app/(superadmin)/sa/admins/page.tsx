import { db } from "@/db";
import { superAdmins } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ShieldAlert, Plus, Trash2 } from "lucide-react";
import { createSuperAdminAction, deleteSuperAdminAction } from "@/app/actions/sa-actions";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { authorizeSecurityPermission } from "@/lib/security-permissions";
import { getSession } from "@/lib/auth";

export default async function SAAdminsPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login");

  const isRoot = await authorizeSecurityPermission(session, "platform.security");
  const allAdmins = await db.select()
    .from(superAdmins)
    .orderBy(desc(superAdmins.createdAt));

  async function createAdmin(formData: FormData) {
    "use server";
    await createSuperAdminAction(formData);
    redirect("/sa/admins"); // Refresh
  }

  async function deleteAdmin(formData: FormData) {
    "use server";
    const id = parseInt(formData.get("id") as string, 10);
    await deleteSuperAdminAction(id);
    redirect("/sa/admins"); // Refresh
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">System Admins</h1>
          <p className="text-stone-500 mt-1">Manage top-level administrators with full system access.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-brand-600" />
                Active Super Admins
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Email Address</th>
                      <th className="px-6 py-4 font-medium">Role Level</th>
                      <th className="px-6 py-4 font-medium">Created At</th>
                      {isRoot && <th className="px-6 py-4 font-medium text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allAdmins.map((admin) => (
                      <tr key={admin.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-brand-950">{admin.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md ${admin.isSuperAdmin ? 'bg-purple-100 text-purple-800' : 'bg-brand-100 text-brand-800'}`}>
                            {admin.isSuperAdmin ? 'Root Super Admin' : 'Admin'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-stone-500">
                          {new Date(admin.createdAt).toLocaleDateString()}
                        </td>
                        {isRoot && (
                          <td className="px-6 py-4 text-right">
                            {admin.id !== session.userId && admin.id !== 1 && (
                              <form action={deleteAdmin}>
                                <input type="hidden" name="id" value={admin.id} />
                                <button type="submit" className="p-2 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors" title="Delete Admin">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </form>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {isRoot && (
          <div>
            <Card>
              <CardHeader className="border-b border-border bg-stone-50/50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Plus className="h-5 w-5 text-brand-600" />
                  Add New Admin
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <form action={createAdmin} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      required
                      className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="admin@lms.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
                    <input
                      type="password"
                      name="password"
                      required
                      className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Security Question</label>
                    <input
                      type="text"
                      name="securityQuestion"
                      required
                      className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="e.g. Favorite Color?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-stone-700 mb-1">Security Answer</label>
                    <input
                      type="text"
                      name="securityAnswer"
                      required
                      className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <SubmitButton className="w-full">Create Admin</SubmitButton>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
