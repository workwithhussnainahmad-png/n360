import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gatewayPaymentAttempts } from "@/db/schema";
import { paymentAccess, publicPaymentFields } from "@/lib/payments/access";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await paymentAccess(req); const { id } = await params;
  if (!access) return NextResponse.json({ error: "Sign in through your portal to view this payment" }, { status: 401 });
  if (!/^[A-Za-z0-9]{1,20}$/.test(id)) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  const [payment] = await db.select({ ...publicPaymentFields, qrImage: gatewayPaymentAttempts.qrImage }).from(gatewayPaymentAttempts).where(and(access, eq(gatewayPaymentAttempts.id, id)));
  if (!payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  return NextResponse.json({ payment }, { headers: { "Cache-Control": "no-store" } });
}

export { retiredOnlinePayment as POST } from "@/lib/retired-online-payment";
