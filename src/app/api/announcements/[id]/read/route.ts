import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { markAnnouncementRead } from "@/lib/announcements";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const announcementId = Number(id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) {
    return NextResponse.json({ error: "Invalid announcement" }, { status: 400 });
  }

  try {
    await markAnnouncementRead(session, announcementId);
    return NextResponse.json({ message: "Marked as read" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Announcement not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
