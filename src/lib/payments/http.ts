import { NextRequest } from "next/server";
import { PaymentError } from "./service";

export async function readPaymentForm(req: NextRequest) {
  if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) throw new PaymentError("Expected payment form response", 415);
  if (!req.body) throw new PaymentError("Empty callback", 400);
  const reader = req.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 32_768) throw new PaymentError("Callback too large", 413); chunks.push(value);
  } } finally { await reader.cancel(); }
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of new URLSearchParams(Buffer.concat(chunks).toString("utf8"))) {
    if (!/^[A-Za-z0-9_]+$/.test(key) || key in result || value.length > 8192) throw new PaymentError("Invalid callback fields", 400);
    result[key] = value;
  }
  return result;
}
