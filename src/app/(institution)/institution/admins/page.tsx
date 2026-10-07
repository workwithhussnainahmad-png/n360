import { db } from "@/db";
import { institutionAdmins } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, Mail, Trash2 } from "lucide-react";
import { InstitutionAdminForm } from "@/components/institution/InstitutionAdminForm";
import { deleteInstitutionAdminAction } from "@/app/actions/institution-actions";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function InstitutionAdminsPage() {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }

  const institutionId = session.institutionId || session.userId;
  const admins = await db.select().from(institutionAdmins).where(eq(institutionAdmins.institutionId, institutionId));

  async function deleteAdmin(formData: FormData) {
    "use server";
    const adminId = parseInt(formData.get("adminId") as string, 10);
    await deleteInstitutionAdminAction(adminId);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Institution Admins</h1>
        <p className="text-stone-500 mt-1">Manage secondary administrators for {session.campusName}. Their access is limited to this campus, except for creating/deleting admins, deleting the campus account, and payment gateway configuration.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-brand-600" />
                Current Admins ({admins.length}/2)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {admins.length === 0 ? (
                <div className="p-4 sm:p-8 text-center text-stone-500">
                  <ShieldCheck className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                  <p>No admins added yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {admins.map((admin) => (
                    <li key={admin.id} className="flex flex-col gap-4 p-4 transition-colors hover:bg-stone-50/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-brand-200 bg-brand-100 font-bold text-brand-700">
                          {admin.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-stone-900">{admin.name}</p>
                          <p className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-stone-500">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{admin.email}</span>
                          </p>
                        </div>
                      </div>
                      {session.role === "INSTITUTION" && !session.campusReadOnly && <form action={deleteAdmin} className="self-end sm:self-auto">
                        <input type="hidden" name="adminId" value={admin.id} />
                        <SubmitButton variant="ghost" size="sm" className="text-danger hover:text-danger hover:bg-danger/10" loadingText="Removing...">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remove
                        </SubmitButton>
                      </form>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {session.role === "INSTITUTION" && !session.campusReadOnly && <div>
          {admins.length < 2 ? (
            <InstitutionAdminForm />
          ) : (
            <Card className="bg-stone-50 border-dashed">
              <CardContent className="p-6 text-center text-stone-500">
                <ShieldCheck className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                <p>You have reached the maximum limit of 2 admins.</p>
                <p className="text-sm mt-1">Remove an existing admin to add a new one.</p>
              </CardContent>
            </Card>
          )}
        </div>}
      </div>
    </div>
  );
}
