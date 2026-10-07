import { NextRequest, NextResponse } from "next/server";
import { jazzCashWsdl, parseJazzCashSoap } from "@/lib/payments/jazzcash-soap";
import { paymentOrigin } from "@/lib/payments/config";
import { processJazzCashNotification, PaymentError } from "@/lib/payments/service";

export async function GET() {
  try { return new NextResponse(jazzCashWsdl(`${paymentOrigin()}/api/webhooks/jazzcash/soap`), { headers: { "Content-Type": "text/xml; charset=utf-8" } }); }
  catch { return new NextResponse("Notification service is not configured", { status: 503 }); }
}
export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("content-type")?.startsWith("text/xml") || !req.body) throw new PaymentError("Expected SOAP 1.1 request", 415);
    const reader = req.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    try { for (;;) { const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > 32_768) throw new PaymentError("Notification too large", 413); chunks.push(value);
    } } finally { await reader.cancel(); }
    const acknowledgement = await processJazzCashNotification(parseJazzCashSoap(Buffer.concat(chunks).toString("utf8")));
    return new NextResponse(acknowledgement, { headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    return new NextResponse("Payment notification was not accepted", { status: error instanceof PaymentError ? error.status : 400 });
  }
}
