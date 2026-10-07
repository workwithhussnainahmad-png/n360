import { NextResponse } from "next/server";
import { failOnlineTestForViolation } from "@/app/actions/online-test-actions";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const onlineTestId = Number(body.onlineTestId);
    if (!Number.isInteger(onlineTestId) || onlineTestId <= 0) {
      return NextResponse.json({ error: "Invalid test" }, { status: 400 });
    }
    const reason = body.reason === "timeout" || body.reason === "disconnect" ? body.reason : "tab_switch";

    await failOnlineTestForViolation(onlineTestId, reason);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to cancel test" }, { status: 400 });
  }
}
