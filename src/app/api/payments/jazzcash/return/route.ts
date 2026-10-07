import { NextRequest, NextResponse } from "next/server";
import { readPaymentForm } from "@/lib/payments/http";
import { paymentResultUrl } from "@/lib/payments/return-url";
import { PaymentError, processJazzCashCallback } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new NextResponse("Invalid payment response", { status: 415 });
  try {
    const result = await processJazzCashCallback(await readPaymentForm(req));
    // A 303 restores GET navigation and the user's SameSite=Lax session.
    return NextResponse.redirect(await paymentResultUrl(result.id), 303);
  } catch (error) {
    return NextResponse.json({ error: error instanceof PaymentError ? error.message : "Could not verify payment. Check payment history before paying again." },
      { status: error instanceof PaymentError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
  }
}
