import { constants, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";

export type EasypaisaCredentials = {
  accountNum: string;
  storeId: string;
  username: string;
  password: string;
  privateKey: string;
  easypaisaPublicKey: string;
};

export type ExpectedPayment = {
  orderId: string;
  accountNum: string;
  storeId: string;
  amount: number;
};

export type VerifiedTransaction = {
  orderId: string;
  accountNum: string;
  storeId: string;
  storeName: string | null;
  transactionStatus: "PAID";
  transactionAmount: string;
  transactionDateTime: string | null;
  paymentMode: string | null;
  responseCode: "0000";
  responseDesc: string | null;
};

function rsaKey(pem: string, privateKey = false) {
  const key = privateKey ? createPrivateKey(pem) : createPublicKey(pem);
  if (key.asymmetricKeyType !== "rsa" || key.asymmetricKeyDetails?.modulusLength !== 2048) {
    throw new Error("Easypaisa requires 2048-bit RSA keys");
  }
  return key;
}

export function validateEasypaisaKeys(credentials: EasypaisaCredentials) {
  rsaKey(credentials.privateKey, true);
  rsaKey(credentials.easypaisaPublicKey);
}

export function credentialsHeader(username: string, password: string) {
  if (!username || username.includes(":") || !password) throw new Error("Invalid Easypaisa credentials");
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

// Remove JSON whitespace without reordering keys or changing spaces/escapes in strings.
// Envelope extraction is deliberately separate: the wire envelope is not confirmed.
export function compactSignedJson(raw: string): string {
  if (Buffer.byteLength(raw, "utf8") > 1_000_000) throw new Error("Easypaisa response too large");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object");
  let quoted = false;
  let escaped = false;
  let result = "";
  for (const char of raw) {
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') {
      quoted = true;
      result += char;
    } else if (!/[\t\n\r ]/.test(char)) result += char;
  }
  return result;
}

export function signRequestJson(raw: string, privateKey: string): string {
  return sign("RSA-SHA256", Buffer.from(compactSignedJson(raw), "utf8"), {
    key: rsaKey(privateKey, true),
    padding: constants.RSA_PKCS1_PADDING,
  }).toString("base64");
}

export function verifyResponseJson(raw: string, signature: string, publicKey: string): boolean {
  try {
    const decoded = Buffer.from(signature, "base64");
    if (decoded.length !== 256 || decoded.toString("base64") !== signature) return false;
    return verify("RSA-SHA256", Buffer.from(compactSignedJson(raw), "utf8"), {
      key: rsaKey(publicKey),
      padding: constants.RSA_PKCS1_PADDING,
    }, decoded);
  } catch {
    return false;
  }
}

export function pkrMinorUnits(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number") throw new Error("Invalid payment amount");
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100)) {
    throw new Error("Invalid payment amount");
  }
  const raw = String(value);
  if (raw.length > 20 || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(raw)) throw new Error("Invalid payment amount");
  const [rupees, paisa = ""] = raw.split(".");
  return BigInt(rupees) * 100n + BigInt(paisa.padEnd(2, "0"));
}

export function generateQrPayload(expected: ExpectedPayment) {
  if (pkrMinorUnits(expected.amount) <= 0n) throw new Error("Payment amount must be positive");
  return {
    storeId: expected.storeId,
    paymentMethod: "QR_PAYMENT_METHOD",
    orderRefNum: expected.orderId,
    amount: String(expected.amount),
  };
}

export function inquireTransactionPayload(expected: ExpectedPayment) {
  return { orderId: expected.orderId, storeId: expected.storeId, accountNum: expected.accountNum };
}

function storeId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
  return null;
}

export function verifyPayment(
  signedJson: string,
  signature: string,
  publicKey: string,
  expected: ExpectedPayment,
): VerifiedTransaction {
  if (!verifyResponseJson(signedJson, signature, publicKey)) throw new Error("Invalid Easypaisa response signature");
  const result = JSON.parse(signedJson) as Record<string, unknown>;
  if (result.responseCode !== "0000" || result.transactionStatus !== "PAID") throw new Error("Payment is not paid");
  if (result.orderId !== expected.orderId) throw new Error("Payment order mismatch");
  if (result.accountNum !== expected.accountNum || storeId(result.storeId) !== expected.storeId) throw new Error("Payment merchant mismatch");
  const expectedAmount = pkrMinorUnits(expected.amount);
  if (expectedAmount <= 0n || pkrMinorUnits(result.transactionAmount) !== expectedAmount) throw new Error("Payment amount mismatch");
  const optionalText = (field: string) => typeof result[field] === "string" ? result[field] as string : null;
  return {
    orderId: expected.orderId,
    accountNum: expected.accountNum,
    storeId: expected.storeId,
    storeName: optionalText("storeName"),
    transactionStatus: "PAID",
    transactionAmount: String(result.transactionAmount),
    transactionDateTime: optionalText("transactionDateTime"),
    paymentMode: optionalText("paymentMode"),
    responseCode: "0000",
    responseDesc: optionalText("responseDesc"),
  };
}
