import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { getVisibleAnnouncements } from "@/lib/announcements";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const announcements = await getVisibleAnnouncements(session, 10);
  return NextResponse.json({
    announcements,
    unreadCount: announcements.filter((announcement) => !announcement.isRead).length,
  });
}
