import { GATEWAYS } from "@/lib/payments/policy";
import { gatewayReadiness } from "@/lib/payments/config";
import { validateEasypaisaKeys } from "@/lib/easypaisa/protocol";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { institutionPaymentGateways, institutions } from "@/db/schema";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { decryptGatewayCredentials, encryptGatewayCredentials, type GatewayCredentials } from "@/lib/payment-credentials";

const easypaisaConfiguration = z.object({
  accountNum: z.string().trim().min(1).max(160),
  storeId: z.string().regex(/^[1-9]\d*$/).max(30),
  username: z.string().min(1).max(160).refine((value) => !value.includes(":")),
  password: z.string().min(1).max(1024),
  privateKey: z.string().min(1).max(8192),
  easypaisaPublicKey: z.string().min(1).max(8192),
}).strict();

const jazzcashConfiguration = z.object({
  merchantId: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(1024),
  hashKey: z.string().min(1).max(1024),
}).strict();

const hblpayConfiguration = z.object({
  integration: z.literal("cybersource-hosted"),
  profileId: z.string().trim().min(1).max(160),
  accessKey: z.string().trim().min(1).max(160),
  secretKey: z.string().min(1).max(1024),
}).strict();

const requestSchema = z.object({
  gateway: z.enum(["easypaisa", "jazzcash", "hblpay"]),
  credentials: z.unknown(),
  enabled: z.boolean().default(false),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
}).strict();

export const GET = requireRole(["INSTITUTION"], async (_req, { session }) => {
  const institutionId = getTenantContext(session);
  const [row] = await db.select().from(institutionPaymentGateways).where(eq(institutionPaymentGateways.institutionId, institutionId));
  const credentials = row ? decryptGatewayCredentials(institutionId, row.credentialsEncrypted) : null;
  const gateways = Object.fromEntries(GATEWAYS.map((gateway) => [gateway, {
    configured: Boolean(credentials?.[gateway]),
    environment: credentials?.settings?.[gateway]?.environment || "sandbox",
    enabled: credentials?.settings?.[gateway]?.enabled === true,
    ...gatewayReadiness(credentials, gateway),
  }]));
  return NextResponse.json({ gateways, easypaisaConfigured: gateways.easypaisa.configured,
    jazzcashConfigured: gateways.jazzcash.configured, hblpayConfigured: gateways.hblpay.configured,
    ready: Object.values(gateways).some((g) => g.ready), updatedAt: row?.updatedAt ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
} , { permission: 'institution.security' });

export const PUT = requireRole(["INSTITUTION"], async (req, { session }) => {
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid gateway configuration" }, { status: 400 });
  const { gateway, enabled, environment } = parsed.data;
  const validation = { easypaisa: easypaisaConfiguration, jazzcash: jazzcashConfiguration, hblpay: hblpayConfiguration }[gateway].safeParse(parsed.data.credentials);
  if (!validation.success) return NextResponse.json({ error: "Provide all required gateway credentials" }, { status: 400 });
  if (gateway === "easypaisa") {
    try { validateEasypaisaKeys(easypaisaConfiguration.parse(validation.data)); }
    catch { return NextResponse.json({ error: "Provide valid RSA-2048 private and Easypaisa public keys" }, { status: 400 }); }
  }
  const institutionId = getTenantContext(session);
  try {
    const updated = await db.transaction(async (tx) => {
      await tx.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, institutionId)).for("update");
      const [row] = await tx.select().from(institutionPaymentGateways).where(eq(institutionPaymentGateways.institutionId, institutionId));
      const existing: GatewayCredentials | null = row ? decryptGatewayCredentials(institutionId, row.credentialsEncrypted) : {};
      if (!existing) throw new Error("Existing credentials cannot be decrypted");
      const credentials = { ...existing, [gateway]: validation.data, settings: { ...existing.settings, [gateway]: { enabled, environment } } };
      const credentialsEncrypted = encryptGatewayCredentials(institutionId, credentials);
      await tx.insert(institutionPaymentGateways).values({ institutionId, credentialsEncrypted }).onConflictDoUpdate({
        target: institutionPaymentGateways.institutionId, set: { credentialsEncrypted, updatedAt: new Date() },
      });
      return credentials;
    });
    return NextResponse.json({ configured: true, ...gatewayReadiness(updated, gateway) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not save configuration. Check the server encryption configuration." }, { status: 503 });
  }
}, { maxBodyBytes: 24 * 1024 , permission: 'institution.security'});

export const DELETE = requireRole(["INSTITUTION"], async (req, { session }) => {
  const parsed = z.object({ gateway: z.enum(["easypaisa", "jazzcash", "hblpay"]) }).strict().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid gateway" }, { status: 400 });
  const institutionId = getTenantContext(session);
  try {
    await db.transaction(async (tx) => {
      await tx.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, institutionId)).for("update");
      const [row] = await tx.select().from(institutionPaymentGateways).where(eq(institutionPaymentGateways.institutionId, institutionId));
      if (!row) return;
      const credentials = decryptGatewayCredentials(institutionId, row.credentialsEncrypted);
      if (!credentials) throw new Error("Configuration unavailable");
      delete credentials[parsed.data.gateway];
      if (credentials.settings) delete credentials.settings[parsed.data.gateway];
      await tx.update(institutionPaymentGateways).set({ credentialsEncrypted: encryptGatewayCredentials(institutionId, credentials), updatedAt: new Date() })
        .where(eq(institutionPaymentGateways.institutionId, institutionId));
    });
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ error: "Could not remove configuration" }, { status: 503 }); }
} , { permission: 'institution.security' });
