import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { validAmount } from "./policy";

export type JazzCashCredentials = { merchantId: string; password: string; hashKey: string };
export type JazzCashOrder = { id: string; amount: number; merchantId: string; createdAt: Date; expiresAt: Date; returnUrl: string };

// Official hash example: sandbox.jazzcash.com.pk/SandboxDocumentation/features.html
export function jazzCashHash(fields: Record<string, string>, secret: string): string {
  const values = Object.keys(fields).filter((key) => /^pp/i.test(key) && key !== "pp_SecureHash" && fields[key] !== "").sort().map((key) => fields[key]);
  return createHmac("sha256", secret).update(`${secret}&${values.join("&")}`, "utf8").digest("hex").toUpperCase();
}

export function pakistanTimestamp(date: Date) {
  return new Date(date.getTime() + 5 * 60 * 60 * 1000).toISOString().replace(/\D/g, "").slice(0, 14);
}

export function jazzCashCheckout(order: JazzCashOrder, credentials: JazzCashCredentials) {
  validAmount(order.amount);
  if (!/^[A-Za-z0-9]{1,20}$/.test(order.id) || order.merchantId !== credentials.merchantId) throw new Error("Invalid payment order");
  const payload: Record<string, string> = {
    pp_Version: "1.1", pp_TxnType: "MWALLET", pp_Language: "EN",
    pp_MerchantID: credentials.merchantId, pp_Password: credentials.password,
    pp_SubMerchantID: "", pp_BankID: "", pp_ProductID: "",
    pp_TxnRefNo: order.id, pp_Amount: String(order.amount * 100), pp_TxnCurrency: "PKR",
    pp_TxnDateTime: pakistanTimestamp(order.createdAt), pp_TxnExpiryDateTime: pakistanTimestamp(order.expiresAt),
    pp_BillReference: order.id, pp_Description: "Institution fee payment", pp_ReturnURL: order.returnUrl,
  };
  payload.pp_SecureHash = jazzCashHash(payload, credentials.hashKey);
  return payload;
}

export function verifyJazzCash(fields: Record<string, string>, order: JazzCashOrder, credentials: JazzCashCredentials) {
  const received = fields.pp_SecureHash;
  if (!received || !/^[a-f\d]{64}$/i.test(received)
    || !timingSafeEqual(Buffer.from(jazzCashHash(fields, credentials.hashKey), "hex"), Buffer.from(received, "hex"))) {
    throw new Error("Invalid payment signature");
  }
  if (fields.pp_TxnRefNo !== order.id || fields.pp_MerchantID !== order.merchantId
    || (fields.pp_BillReference && fields.pp_BillReference !== order.id)) throw new Error("Payment order mismatch");
  if (fields.pp_TxnCurrency !== "PKR" || !/^\d{1,12}$/.test(fields.pp_Amount || "")
    || BigInt(fields.pp_Amount) !== BigInt(validAmount(order.amount)) * 100n) throw new Error("Payment amount mismatch");
  const code = fields.pp_ResponseCode;
  if (!/^\d{3}$/.test(code || "")) throw new Error("Invalid response code");
  const reference = fields.pp_RetreivalReferenceNo;
  if (code === "000" && (!reference || !/^[A-Za-z0-9/-]{1,160}$/.test(reference))) throw new Error("Missing provider reference");
  // Store a digest of the authenticated fields, never passwords or the raw payload.
  const evidenceDigest = createHash("sha256").update(JSON.stringify(Object.entries(fields).filter(([key]) => /^pp/i.test(key) && key !== "pp_Password").sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
  return { paid: code === "000", code, reference: reference || null, evidenceDigest };
}

export function parseJazzCashForm(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > 32_768) throw new Error("Callback too large");
  const result: Record<string, string> = Object.create(null);
  for (const [key, value] of new URLSearchParams(raw)) {
    if (!/^pp[A-Za-z0-9_]+$/.test(key) || key in result || value.length > 4096) throw new Error("Invalid callback fields");
    result[key] = value;
  }
  return result;
}
