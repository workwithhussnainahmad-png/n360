import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { pkrMinorUnits } from "@/lib/easypaisa/protocol";
import { validAmount } from "./policy";

// This adapter supports ONLY HBL-issued Cybersource Secure Acceptance Hosted Checkout profiles.
// It does not implement HBL's separate proprietary API/Connect products.
export type HblCredentials = { integration: "cybersource-hosted"; profileId: string; accessKey: string; secretKey: string };
type Order = { id: string; amount: number; merchantId: string; returnUrl: string };

export function orderUuid(id: string) {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex")).update(`nisaab360:payment:${id}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function cybersourceSignature(fields: Record<string, string>, secret: string) {
  const names = (fields.signed_field_names || "").split(",");
  if (!names.length || new Set(names).size !== names.length || names.some((name) => !/^[a-z0-9_]+$/.test(name) || !(name in fields))) throw new Error("Invalid signed fields");
  return createHmac("sha256", secret).update(names.map((name) => `${name}=${fields[name]}`).join(","), "utf8").digest("base64");
}

export function hblCheckout(order: Order, credentials: HblCredentials) {
  if (credentials.integration !== "cybersource-hosted" || order.merchantId !== credentials.profileId) throw new Error("HBL profile mismatch");
  const fields: Record<string, string> = {
    access_key: credentials.accessKey, profile_id: credentials.profileId, transaction_uuid: orderUuid(order.id),
    signed_field_names: "", unsigned_field_names: "", signed_date_time: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    locale: "en", transaction_type: "sale", reference_number: order.id,
    amount: `${validAmount(order.amount)}.00`, currency: "PKR", payment_method: "card",
    override_custom_receipt_page: order.returnUrl, override_custom_cancel_page: order.returnUrl,
  };
  fields.signed_field_names = Object.keys(fields).join(",");
  fields.signature = cybersourceSignature(fields, credentials.secretKey);
  return fields;
}

export function verifyHbl(fields: Record<string, string>, order: Order, credentials: HblCredentials) {
  const critical = ["signed_field_names", "decision", "reason_code", "req_reference_number", "req_amount", "req_currency",
    "req_profile_id", "req_access_key", "req_transaction_uuid", "req_transaction_type"];
  const names = new Set((fields.signed_field_names || "").split(","));
  if (critical.some((name) => !names.has(name))) throw new Error("Unsigned payment fields");
  const signature = fields.signature || "";
  const expected = cybersourceSignature(fields, credentials.secretKey);
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature) || !timingSafeEqual(Buffer.from(expected, "base64"), Buffer.from(signature, "base64"))) throw new Error("Invalid HBL signature");
  if (fields.req_reference_number !== order.id || fields.req_profile_id !== order.merchantId || fields.req_profile_id !== credentials.profileId
    || fields.req_access_key !== credentials.accessKey || fields.req_transaction_uuid !== orderUuid(order.id) || fields.req_transaction_type !== "sale") throw new Error("Payment order mismatch");
  if (fields.req_currency !== "PKR" || pkrMinorUnits(fields.req_amount) !== BigInt(order.amount) * 100n) throw new Error("Payment amount mismatch");
  const paid = fields.decision === "ACCEPT" && fields.reason_code === "100";
  if (paid && (!names.has("transaction_id") || !/^[A-Za-z0-9_-]{1,160}$/.test(fields.transaction_id || ""))) throw new Error("Missing provider transaction ID");
  return { paid, code: fields.reason_code, reference: fields.transaction_id || null,
    evidenceDigest: createHash("sha256").update(expected).digest("hex") };
}
