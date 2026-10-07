import { NextRequest, NextResponse } from "next/server";
import { checkExpoPushReceipts } from "@/lib/notifications";
import { timingSafeEqual } from "@/lib/auth";

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not configured; rejecting push receipt cron request");
    return false;
  }

  const authHeader = req.headers.get("authorization");
  const cronHeader = req.headers.get("x-cron-secret");
  // Constant-time comparison: `===` on strings short-circuits at the first
  // differing byte, which leaks the secret's prefix to an attacker who can time
  // enough requests. Same helper the session-header verification uses.
  return (authHeader !== null && timingSafeEqual(authHeader, `Bearer ${secret}`))
    || (cronHeader !== null && timingSafeEqual(cronHeader, secret));
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await checkExpoPushReceipts();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Push receipt check failed:", error);
    return NextResponse.json({ error: "Push receipt check failed" }, { status: 500 });
  }
}
