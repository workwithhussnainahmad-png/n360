import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { gatewayPaymentAttempts, institutions } from "@/db/schema";
import { getPublicSiteBaseDomain } from "@/lib/public-site-domain";
import { paymentOrigin } from "./config";

export async function paymentResultUrl(id: string) {
  const [row] = await db.select({ applicationId: gatewayPaymentAttempts.applicationId, slug: institutions.publicSlug })
    .from(gatewayPaymentAttempts).innerJoin(institutions, and(eq(institutions.id, gatewayPaymentAttempts.institutionId)))
    .where(eq(gatewayPaymentAttempts.id, id));
  if (row?.applicationId && row.slug) {
    const domain = await getPublicSiteBaseDomain();
    if (!/^[a-z0-9.-]+$/.test(domain) || !/^[a-z0-9-]+$/.test(row.slug)) throw new Error("Invalid institution domain");
    return new URL(`/payments/${id}`, `https://${row.slug}.${domain}`);
  }
  return new URL(`/payments/${id}`, paymentOrigin());
}
