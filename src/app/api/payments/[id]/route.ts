import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gatewayPaymentAttempts } from "@/db/schema";
import { paymentAccess, publicPaymentFields } from "@/lib/payments/access";
import { checkPayment, ensurePaymentQr, PaymentError } from "@/lib/payments/service";
import { withRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await paymentAccess(req); const { id } = await params;
  if (!access) return NextResponse.json({ error: "Sign in through your portal to view this payment" }, { status: 401 });
  if (!/^[A-Za-z0-9]{1,20}$/.test(id)) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const [payment] = await db.select({ ...publicPaymentFields, qrImage: gatewayPaymentAttempts.qrImage }).from(gatewayPaymentAttempts).where(and(access, eq(gatewayPaymentAttempts.id, id)));
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ payment }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await paymentAccess(req); const { id } = await params;
  if (!access) return NextResponse.json({ error: "Sign in to check payment status" }, { status: 401 });
  const [payment] = await db.select({ id: gatewayPaymentAttempts.id }).from(gatewayPaymentAttempts).where(and(access, eq(gatewayPaymentAttempts.id, id)));
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const limited = await withRateLimit(req, "api", `payment-check:${id}`);
  if (!limited.success) return NextResponse.json({ error: "Please wait before checking again" }, { status: 429 });
  try {
    const body = await req.json().catch(() => null);
    if (body?.action === "qr") return NextResponse.json({ qrImage: await ensurePaymentQr(id) }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(await checkPayment(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Provider verification is temporarily unavailable. Do not pay again if your account was debited." },
      { status: error instanceof PaymentError ? error.status : 503 });
  }
}
