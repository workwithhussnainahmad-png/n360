import { createHash } from "node:crypto";
import { credentialsHeader, generateQrPayload, inquireTransactionPayload, signRequestJson, verifyPayment, verifyResponseJson,
  type EasypaisaCredentials, type ExpectedPayment } from "@/lib/easypaisa/protocol";
import type { PaymentEnvironment } from "./policy";

// Official Integration Guides: QR (pp.5-6) and Inquire Mobile Account with RSA (pp.5-6).
export function signedRequest(request: Record<string, string>, privateKey: string) {
  return JSON.stringify({ request, signature: signRequestJson(JSON.stringify(request), privateKey) });
}

export function signedResponse(raw: string, publicKey: string) {
  if (Buffer.byteLength(raw, "utf8") > 512_000) throw new Error("Provider response too large");
  // Preserve the exact nested JSON property order used in the provider's signature.
  const match = /^\s*\{\s*"response"\s*:\s*(\{[\s\S]*\})\s*,\s*"signature"\s*:\s*("[^"\\]*")\s*\}\s*$/.exec(raw);
  if (!match) throw new Error("Unsupported signed response envelope");
  const signature: string = JSON.parse(match[2]);
  if (!verifyResponseJson(match[1], signature, publicKey)) throw new Error("Invalid Easypaisa signature");
  return { raw: match[1], signature, value: JSON.parse(match[1]) as Record<string, unknown> };
}

export function easypaisaEndpoint(kind: "qr" | "inquiry", environment: PaymentEnvironment) {
  const name = `EASYPAISA_${environment === "sandbox" ? "SANDBOX_" : ""}${kind === "qr" ? "QR" : "INQUIRY"}_URL`;
  const value = process.env[name]; if (!value) throw new Error(`${name} is required`);
  const url = new URL(value);
  const hosts = environment === "sandbox" ? ["easypaisastg.easypaisa.com.pk", "easypaystg.easypaisa.com.pk"] : ["easypaisa.com.pk", "easypay.easypaisa.com.pk"];
  const path = kind === "qr" ? /^\/(?:Easypaisa|easypay)-service\/rest\/QRBusinessRestService\/v1\/generate-qr$/
    : /^\/easypay-service\/rest\/v5\/inquire-transaction$/;
  // v4 is the separately documented non-RSA API; never send an RSA envelope to it.
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !path.test(url.pathname)) {
    throw new Error("Invalid Easypaisa endpoint");
  }
  return url.href;
}

async function call(kind: "qr" | "inquiry", request: Record<string, string>, credentials: EasypaisaCredentials, environment: PaymentEnvironment) {
  const response = await fetch(easypaisaEndpoint(kind, environment), {
    method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/json", Credentials: credentialsHeader(credentials.username, credentials.password) },
    body: signedRequest(request, credentials.privateKey),
  });
  if (!response.ok || !response.body) throw new Error("Easypaisa request failed");
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 512_000) throw new Error("Provider response too large"); chunks.push(value);
  } } finally { await reader.cancel(); }
  return signedResponse(Buffer.concat(chunks).toString("utf8"), credentials.easypaisaPublicKey);
}

export function qrImage(value: unknown) {
  if (typeof value !== "string" || value.length > 350_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("Invalid QR image");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 33 || bytes.toString("base64") !== value || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || bytes.readUInt32BE(16) > 4096 || bytes.readUInt32BE(20) > 4096) throw new Error("Expected a PNG QR image");
  return `data:image/png;base64,${value}`;
}

export async function generateEasypaisaQr(expected: ExpectedPayment, credentials: EasypaisaCredentials, environment: PaymentEnvironment) {
  const response = await call("qr", generateQrPayload(expected), credentials, environment);
  if (response.value.responseCode !== "0000") throw new Error("Easypaisa could not generate a payment QR");
  return qrImage(response.value.qrCode);
}

export async function inquireEasypaisa(expected: ExpectedPayment, credentials: EasypaisaCredentials, environment: PaymentEnvironment) {
  const response = await call("inquiry", inquireTransactionPayload(expected), credentials, environment);
  if (response.value.responseCode !== "0000" || response.value.transactionStatus !== "PAID") return null;
  const payment = verifyPayment(response.raw, response.signature, credentials.easypaisaPublicKey, expected);
  // This API documents no transaction ID. Preserve its verified order ID, never invent one.
  return { paid: true, code: "0000", reference: payment.orderId, evidenceDigest: createHash("sha256").update(response.raw).digest("hex") };
}
