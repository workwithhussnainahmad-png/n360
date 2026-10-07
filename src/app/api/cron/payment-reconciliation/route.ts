import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { gatewayPaymentAttempts as attempts } from "@/db/schema";
import { checkPayment } from "@/lib/payments/service";

export const maxDuration = 60;
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get("authorization") || "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!secret || secret.length < 32 || !timingSafeEqual(digest(supplied), digest(`Bearer ${secret}`))) return new NextResponse("Unauthorized", { status: 401 });
  const pending = await db.select({ id: attempts.id }).from(attempts).where(and(
    eq(attempts.status, "PENDING"), inArray(attempts.gateway, ["easypaisa", "jazzcash"]),
    gt(attempts.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  )).orderBy(sql`${attempts.lastCheckedAt} asc nulls first`, attempts.createdAt).limit(12);
  let processed = 0, unavailable = 0;
  for (let offset = 0; offset < pending.length; offset += 3) {
    const results = await Promise.allSettled(pending.slice(offset, offset + 3).map(({ id }) => checkPayment(id)));
    for (const result of results) { if (result.status === "fulfilled") processed++; else unavailable++; }
  }
  return NextResponse.json({ processed, unavailable }, { headers: { "Cache-Control": "no-store" } });
}
