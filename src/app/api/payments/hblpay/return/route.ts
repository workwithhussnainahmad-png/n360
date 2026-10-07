import { NextRequest, NextResponse } from "next/server";
import { readPaymentForm } from "@/lib/payments/http";
import { paymentResultUrl } from "@/lib/payments/return-url";
import { PaymentError, processHblCallback } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  try {
    const result = await processHblCallback(await readPaymentForm(req));
    return NextResponse.redirect(await paymentResultUrl(result.id), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Payment verification unavailable. Check payment history before retrying." },
      { status: error instanceof PaymentError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
