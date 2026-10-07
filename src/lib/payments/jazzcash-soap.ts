import { createHash, timingSafeEqual } from "node:crypto";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { jazzCashHash, pakistanTimestamp, type JazzCashCredentials, type JazzCashOrder } from "./jazzcash";
import type { PaymentEnvironment } from "./policy";

export const SOAP_FIELDS = ["pp_Version", "pp_TxnType", "pp_BankID", "pp_ProductID", "pp_Password", "pp_TxnRefNo",
  "pp_TxnDateTime", "pp_ResponseCode", "pp_ResponseMessage", "pp_AuthCode", "pp_SettlementExpiry", "pp_RetreivalReferenceNo", "pp_SecureHash"];

export function parseJazzCashSoap(raw: string) {
  if (Buffer.byteLength(raw, "utf8") > 32_768 || /<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(raw) || XMLValidator.validate(raw) !== true) throw new Error("Invalid SOAP document");
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, trimValues: false, processEntities: true }).parse(raw);
  const body = parsed?.Envelope?.Body;
  if (!body || Object.keys(body).length !== 1 || !body.UpdatePaymentStatus || typeof body.UpdatePaymentStatus !== "object") throw new Error("Unsupported SOAP operation");
  const fields: Record<string, string> = Object.create(null);
  for (const [name, value] of Object.entries(body.UpdatePaymentStatus)) {
    if (!SOAP_FIELDS.includes(name) || typeof value !== "string" || value.length > 4096) throw new Error("Invalid SOAP fields");
    fields[name] = value;
  }
  return fields;
}

export function verifyJazzCashUpdate(fields: Record<string, string>, order: JazzCashOrder, credentials: JazzCashCredentials) {
  const signature = fields.pp_SecureHash || "";
  if (!/^[a-f\d]{64}$/i.test(signature) || !timingSafeEqual(Buffer.from(jazzCashHash(fields, credentials.hashKey), "hex"), Buffer.from(signature, "hex"))) throw new Error("Invalid notification signature");
  if (fields.pp_TxnRefNo !== order.id || fields.pp_TxnDateTime !== pakistanTimestamp(order.createdAt)
    || fields.pp_Version !== "1.1" || fields.pp_TxnType !== "MWALLET" || fields.pp_Password !== credentials.password) throw new Error("Payment notification mismatch");
  const code = fields.pp_ResponseCode;
  if (!/^\d{3}$/.test(code || "")) throw new Error("Invalid notification code");
  const reference = fields.pp_RetreivalReferenceNo;
  if (code === "000" && !/^\d{12}$/.test(reference || "")) throw new Error("Missing provider reference");
  return { paid: code === "000", code, reference: reference || null,
    evidenceDigest: createHash("sha256").update(signature.toUpperCase()).digest("hex") };
}

export function jazzCashSoapAcknowledgement(secret: string) {
  const code = "000", message = " ".repeat(200);
  const hash = jazzCashHash({ pp_ResponseCode: code, pp_ResponseMessage: message }, secret);
  return `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><UpdatePaymentStatusResponse xmlns="http://tempuri.org/"><UpdatePaymentStatusResult>${code}${message}${hash}</UpdatePaymentStatusResult></UpdatePaymentStatusResponse></s:Body></s:Envelope>`;
}

export function jazzCashWsdl(endpoint: string) {
  const address = endpoint.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const elements = SOAP_FIELDS.map((name) => `<xsd:element name="${name}" type="xsd:string" minOccurs="0"/>`).join("");
  return `<?xml version="1.0"?><definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:tns="http://tempuri.org/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" targetNamespace="http://tempuri.org/" name="PaymentStatusService">
  <types><xsd:schema targetNamespace="http://tempuri.org/" elementFormDefault="qualified"><xsd:element name="UpdatePaymentStatus"><xsd:complexType><xsd:sequence>${elements}</xsd:sequence></xsd:complexType></xsd:element><xsd:element name="UpdatePaymentStatusResponse"><xsd:complexType><xsd:sequence><xsd:element name="UpdatePaymentStatusResult" type="xsd:string"/></xsd:sequence></xsd:complexType></xsd:element></xsd:schema></types>
  <message name="UpdateRequest"><part name="parameters" element="tns:UpdatePaymentStatus"/></message><message name="UpdateResponse"><part name="parameters" element="tns:UpdatePaymentStatusResponse"/></message>
  <portType name="PaymentStatusPort"><operation name="UpdatePaymentStatus"><input message="tns:UpdateRequest"/><output message="tns:UpdateResponse"/></operation></portType>
  <binding name="PaymentStatusBinding" type="tns:PaymentStatusPort"><soap:binding transport="http://schemas.xmlsoap.org/soap/http" style="document"/><operation name="UpdatePaymentStatus"><soap:operation soapAction="http://tempuri.org/UpdatePaymentStatus"/><input><soap:body use="literal"/></input><output><soap:body use="literal"/></output></operation></binding>
  <service name="PaymentStatusService"><port name="PaymentStatusPort" binding="tns:PaymentStatusBinding"><soap:address location="${address}"/></port></service></definitions>`;
}

export function jazzCashInquiryConfig(environment: PaymentEnvironment) {
  const prefix = environment === "sandbox" ? "JAZZCASH_SANDBOX_" : "JAZZCASH_";
  const url = new URL(process.env[`${prefix}INQUIRY_URL`] || "");
  const action = process.env[`${prefix}INQUIRY_SOAP_ACTION`] || "";
  const hosts = environment === "sandbox" ? ["sandbox.jazzcash.com.pk"] : ["payments.jazzcash.com.pk", "jazzcash.com.pk"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash
    || !/^https?:\/\/[A-Za-z0-9._/-]+\/DoPaymentStatusInquiryNew$/.test(action)) throw new Error("JazzCash SOAP inquiry configuration is incomplete");
  return { url: url.href, action };
}

export function verifyInquiryResult(result: string, secret: string) {
  // v4.2 guide, section 7.2: exact fixed-length response, padded with ASCII 32.
  if (result.length !== 341 || !/^[\x20-\x7e]+$/.test(result)) throw new Error("Unsupported inquiry response");
  const layout: [string, number][] = [["pp_ResponseCode", 3], ["pp_ResponseMessage", 200], ["pp_RetreivalReferenceNo", 12],
    ["pp_SettlementDate", 8], ["pp_AuthCode", 12], ["pp_SettlementExpiry", 14], ["pp_BankID", 4], ["pp_ProductID", 4], ["pp_CustomerCardNo", 20]];
  const fields: Record<string, string> = {}; let offset = 0;
  for (const [name, length] of layout) { fields[name] = result.slice(offset, offset + length).trimEnd(); offset += length; }
  const signature = result.slice(offset);
  if (!/^[a-f\d]{64}$/i.test(signature) || !timingSafeEqual(Buffer.from(jazzCashHash(fields, secret), "hex"), Buffer.from(signature, "hex"))) throw new Error("Invalid inquiry signature");
  if (fields.pp_ResponseCode !== "000") return null;
  if (!/^\d{12}$/.test(fields.pp_RetreivalReferenceNo)) throw new Error("Missing inquiry reference");
  return { code: "000", reference: fields.pp_RetreivalReferenceNo, evidenceDigest: createHash("sha256").update(result).digest("hex") };
}

export async function inquireJazzCash(order: JazzCashOrder, credentials: JazzCashCredentials, environment: PaymentEnvironment) {
  const { url, action } = jazzCashInquiryConfig(environment);
  const fields: Record<string, string> = { pp_Version: "1.1", pp_TxnType: "MWALLET", pp_MerchantId: credentials.merchantId,
    pp_Password: credentials.password, pp_TxnRefNo: order.id, pp_TxnDateTime: pakistanTimestamp(order.createdAt) };
  fields.pp_SecureHash = jazzCashHash(fields, credentials.hashKey);
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><DoPaymentStatusInquiryNew xmlns="http://tempuri.org/">${Object.entries(fields).map(([name, value]) => `<${name}>${escape(value)}</${name}>`).join("")}</DoPaymentStatusInquiryNew></s:Body></s:Envelope>`;
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` },
    body, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok || !response.body) throw new Error("JazzCash inquiry unavailable");
  const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 32_768) throw new Error("Inquiry response too large"); chunks.push(value);
  } } finally { await reader.cancel(); }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(raw) || XMLValidator.validate(raw) !== true) throw new Error("Invalid inquiry response");
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: true, parseTagValue: false, trimValues: false, processEntities: true }).parse(raw);
  const result = parsed?.Envelope?.Body?.DoPaymentStatusInquiryNewResponse?.DoPaymentStatusInquiryNewResult;
  if (typeof result !== "string") throw new Error("Unsupported inquiry response");
  // This response is obtained directly over TLS for the stored, signed order, never from a browser.
  return verifyInquiryResult(result, credentials.hashKey);
}
