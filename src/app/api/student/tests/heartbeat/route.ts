import { NextRequest, NextResponse } from "next/server";
import { getLightSessionFromRequest } from "@/lib/auth";
import { withRateLimit } from "@/lib/rate-limit";
import { heartbeatOnlineTestAction } from "@/app/actions/online-test-actions";

export async function POST(req: NextRequest) {
  try {
    const rateLimit = await withRateLimit(req, "heartbeat");
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const session = await getLightSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const onlineTestId = Number(body.onlineTestId);
    if (!Number.isInteger(onlineTestId) || onlineTestId <= 0) {
      return NextResponse.json({ error: "Invalid test" }, { status: 400 });
    }

    const result = await heartbeatOnlineTestAction(onlineTestId, session);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update heartbeat" }, { status: 400 });
  }
}
