import { NextResponse } from "next/server";
import { db } from "@/db";
import { systemSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [settings] = await db.select({ version: systemSettings.softwareVersion }).from(systemSettings).limit(1);
    return NextResponse.json({ version: settings?.version || "1.0.0" });
  } catch (error) {
    console.error("Error fetching software version:", error);
    return NextResponse.json({ version: "1.0.0" });
  }
}
