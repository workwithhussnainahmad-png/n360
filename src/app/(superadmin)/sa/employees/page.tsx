import { actionFeedback } from '@/lib/action-feedback';
import { ActionForm } from '@/components/ui/action-form';
import { db } from "@/db";
import { employees } from "@/db/schema";
import { desc } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, Plus } from "lucide-react";
import { createEmployeeAction, toggleEmployeeStatusAction } from "@/app/actions/sa-actions";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import { getSession } from "@/lib/auth";

export default async function SAEmployeesPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") redirect("/login/super-admin");
  const allEmployees = await db.select()
    .from(employees)
    .orderBy(desc(employees.createdAt));

  async function createEmployee(formData: FormData) {
    "use server";
    return actionFeedback(async () => {
    await createEmployeeAction(formData);
    redirect("/sa/employees");

    });
  }

  async function toggleStatus(formData: FormData) {
    "use server";
    return actionFeedback(async () => {
    const id = parseInt(formData.get("id") as string, 10);
    const disabled = formData.get("disabled") === "true";
    await toggleEmployeeStatusAction(id, disabled);
    redirect("/sa/employees");

    });
  }

  return (
    <div className="space-y-8 animate-fade-in">

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-brand-600" />
                Employee Directory
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Employee Name</th>
                      <th className="px-6 py-4 font-medium">Email Address</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allEmployees.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                          No employees found.
                        </td>
                      </tr>
                    )}
                    {allEmployees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-800 flex items-center justify-center font-bold text-xs">
                              {emp.name.substring(0, 2).toUpperCase()}
                            </div>
                            <p className="font-semibold text-brand-950">{emp.name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-stone-600">{emp.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                            emp.deletedAt === null ? 'bg-success/20 text-emerald-700' : 'bg-danger/20 text-red-700'
                          }`}>
                            {emp.deletedAt === null ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <ActionForm action={toggleStatus}>
                              <input type="hidden" name="id" value={emp.id} />
                              <input type="hidden" name="disabled" value={(emp.deletedAt !== null).toString()} />
                              <SubmitButton
                                variant="outline"
                                size="sm"
                                className={emp.deletedAt === null ? "text-danger hover:text-danger hover:bg-danger/10" : "text-success hover:text-success hover:bg-success/10"}
                                loadingText={emp.deletedAt === null ? 'Disabling...' : 'Enabling...'}
                              >
                                {emp.deletedAt === null ? 'Disable' : 'Enable'}
                              </SubmitButton>
                            </ActionForm>
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

        <div>
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="h-5 w-5 text-brand-600" />
                Add New Employee
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <ActionForm action={createEmployee} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    name="email"
                    required
                    className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="john@lms.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Temporary Password</label>
                  <input
                    type="password"
                    name="password"
                    required
                    className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-stone-500 mt-1">They will be forced to change this on first login.</p>
                </div>
                <SubmitButton
                  className="w-full bg-brand-800 text-white rounded-md py-2 text-sm font-medium hover:bg-brand-900 transition-colors"
                >
                  Create Employee
                </SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
