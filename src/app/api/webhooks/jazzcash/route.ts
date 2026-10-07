import { NextRequest, NextResponse } from "next/server";
import { readPaymentForm } from "@/lib/payments/http";
import { PaymentError, processJazzCashCallback } from "@/lib/payments/service";

// Signed HTTP POST response only. JazzCash SOAP IPN is a different protocol.
export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) {
    return NextResponse.json({ error: "Expected payment form response" }, { status: 415 });
  }
  try {
    const result = await processJazzCashCallback(await readPaymentForm(req));
    return NextResponse.json({ received: true, status: result.status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Payment callback could not be processed" },
      { status: error instanceof PaymentError ? error.status : 503 });
  }
}
