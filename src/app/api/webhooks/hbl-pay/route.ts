import { NextRequest, NextResponse } from "next/server";
import { readPaymentForm } from "@/lib/payments/http";
import { PaymentError, processHblCallback } from "@/lib/payments/service";

// Configure as the Merchant POST URL in the HBL-issued Cybersource profile.
export async function POST(req: NextRequest) {
  try {
    const result = await processHblCallback(await readPaymentForm(req));
    return NextResponse.json({ received: true, status: result.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Payment notification could not be processed" },
      { status: error instanceof PaymentError ? error.status : 503 });
  }
}
