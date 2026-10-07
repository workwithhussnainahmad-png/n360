import { NextResponse } from "next/server";

// No financial writes are permitted from this unverified callback protocol.
export async function POST() {
  return NextResponse.json({ error: "Unsigned payment notifications are not supported" }, { status: 503 });
}
