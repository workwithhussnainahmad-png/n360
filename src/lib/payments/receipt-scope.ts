import { and, eq, sql } from "drizzle-orm";
import { gatewayPaymentAttempts as attempts } from "@/db/schema";

// Accept only identity values from a verified server session.
export function accountPaymentScope(role: string, userId: number, institutionId: number) {
    const tenant = eq(attempts.institutionId, institutionId);
    if (["INSTITUTION", "INSTITUTION_ADMIN"].includes(role)) return tenant;
    if (role === "STUDENT" || role === "PARENT") {
      const linkedStudent = role === "STUDENT" ? sql`s.id = ${userId}`
        : sql`exists (select 1 from parent_students ps where ps.student_id = s.id and ps.institution_id = ${institutionId} and ps.parent_id = ${userId})`;
      return and(tenant, sql`exists (
        select 1 from students s where s.institution_id = ${institutionId} and s.deleted_at is null and ${linkedStudent}
        and (exists (select 1 from fee_invoices fi where fi.id = ${attempts.invoiceId} and fi.student_id = s.id and fi.institution_id = s.institution_id)
          or exists (select 1 from admission_enrollments ae where ae.application_id = ${attempts.applicationId} and ae.student_id = s.id and ae.institution_id = s.institution_id))
      )`);
    }
  return null;
}
