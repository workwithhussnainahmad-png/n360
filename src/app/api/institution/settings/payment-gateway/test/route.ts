import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { feeInvoices } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { isGateway } from "@/lib/payments/policy";
import { PaymentError, startPayment } from "@/lib/payments/service";

export const POST = requireRole(["INSTITUTION"], async (req, { session }) => {
  const body = await req.json().catch(() => null); const institutionId = getTenantContext(session);
  if (!body || !isGateway(body.gateway) || !Number.isSafeInteger(body.invoiceId) || body.invoiceId <= 0) return NextResponse.json({ error: "Select a gateway and a valid challan ID" }, { status: 400 });
  const [invoice] = await db.select().from(feeInvoices).where(and(eq(feeInvoices.id, body.invoiceId), eq(feeInvoices.institutionId, institutionId)));
  if (!invoice) return NextResponse.json({ error: "Challan not found" }, { status: 404 });
  try {
    return NextResponse.json(await startPayment(institutionId, { invoiceId: invoice.id, studentId: invoice.studentId }, body.gateway, true),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Sandbox initialization unavailable" }, { status: error instanceof PaymentError ? error.status : 503 });
  }
}, { maxBodyBytes: 2048 , permission: 'institution.security'});
