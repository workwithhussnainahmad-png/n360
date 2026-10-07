import type { GatewayCredentials } from "@/lib/payment-credentials";
import { adapterAvailable, GATEWAYS, type Gateway, type PaymentEnvironment } from "./policy";
import { easypaisaEndpoint } from "./easypaisa";
import { jazzCashInquiryConfig } from "./jazzcash-soap";

export function paymentOrigin() {
  const url = new URL(process.env.PAYMENT_PUBLIC_ORIGIN || "");
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PAYMENT_PUBLIC_ORIGIN must be a registered HTTPS origin");
  }
  return url.origin;
}

export function jazzCashEndpoint(environment: PaymentEnvironment) {
  const raw = environment === "production" ? process.env.JAZZCASH_CHECKOUT_URL : process.env.JAZZCASH_SANDBOX_CHECKOUT_URL;
  if (!raw) throw new Error("JazzCash merchant checkout endpoint is not configured");
  const url = new URL(raw);
  const hosts = environment === "production" ? ["payments.jazzcash.com.pk", "jazzcash.com.pk"] : ["sandbox.jazzcash.com.pk"];
  if (url.protocol !== "https:" || !hosts.includes(url.hostname) || url.port || url.username || url.password
    || url.search || url.hash || !/^\/CustomerPortal\/transactionmanagement\/merchantform\/?$/i.test(url.pathname)) {
    throw new Error("Invalid JazzCash checkout endpoint");
  }
  return url.href;
}

export function gatewayReadiness(credentials: GatewayCredentials | null, gateway: Gateway) {
  if (!credentials?.[gateway]) return { ready: false, reason: "Not configured" };
  if (gateway === "hblpay" && credentials.hblpay?.integration !== "cybersource-hosted") return { ready: false, reason: "Requires an HBL-issued Cybersource Hosted Checkout profile" };
  if (!adapterAvailable[gateway]) return { ready: false, reason: "Awaiting the merchant integration specification and verification fixtures" };
  if (!credentials.settings?.[gateway]?.enabled) return { ready: false, reason: "Saved; payment collection is disabled" };
  if (credentials.settings[gateway]?.environment !== "production") return { ready: false, reason: "Sandbox configuration; live collection is disabled" };
  if (!(process.env.PAYMENT_VERIFIED_GATEWAYS || "").split(",").map((s) => s.trim()).includes(gateway)) {
    return { ready: false, reason: "Awaiting provider acceptance testing" };
  }
  try { paymentOrigin(); if (gateway === "jazzcash") { jazzCashEndpoint("production"); jazzCashInquiryConfig("production"); }
    if (gateway === "easypaisa") { easypaisaEndpoint("qr", "production"); easypaisaEndpoint("inquiry", "production"); } }
  catch { return { ready: false, reason: "Payment server configuration is incomplete" }; }
  return { ready: true, reason: "Live payment collection enabled" };
}

export function activeGateways(credentials: GatewayCredentials | null) {
  return GATEWAYS.filter((gateway) => gatewayReadiness(credentials, gateway).ready);
}
