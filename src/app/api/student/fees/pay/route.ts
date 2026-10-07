import { NextResponse } from "next/server";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { isGateway } from "@/lib/payments/policy";
import { PaymentError, startPayment } from "@/lib/payments/service";

export const POST = requireRole(["STUDENT"], async (req, { session }) => {
  const body = await req.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.invoiceId) || body.invoiceId <= 0 || !isGateway(body.gateway)) {
    return NextResponse.json({ error: "Invalid payment request" }, { status: 400 });
  }
  try {
    return NextResponse.json(await startPayment(getTenantContext(session), { invoiceId: body.invoiceId, studentId: session.userId }, body.gateway),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Payment service unavailable. Please try again later." },
      { status: error instanceof PaymentError ? error.status : 503 });
  }
}, { maxBodyBytes: 2048 });
