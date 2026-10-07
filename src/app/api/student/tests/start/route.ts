import { NextResponse } from "next/server";
import { startOnlineTestAttemptAction } from "@/app/actions/online-test-actions";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const onlineTestId = Number(body.onlineTestId);
    if (!Number.isInteger(onlineTestId) || onlineTestId <= 0) {
      return NextResponse.json({ error: "Invalid test" }, { status: 400 });
    }

    const result = await startOnlineTestAttemptAction(onlineTestId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to start test" }, { status: 400 });
  }
}
