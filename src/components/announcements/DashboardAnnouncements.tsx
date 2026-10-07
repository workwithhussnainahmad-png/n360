import Link from "next/link";
import type { VisibleAnnouncement } from "@/lib/announcements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Megaphone } from "lucide-react";
import { LocalDateTime } from "@/components/LocalDateTime";

export function DashboardAnnouncements({ announcements }: { announcements: VisibleAnnouncement[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Megaphone className="h-5 w-5 text-brand-600" />
          Recent Announcements
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {announcements.length === 0 ? (
          <p className="py-2 text-sm text-stone-500">No announcements.</p>
        ) : (
          announcements.slice(0, 4).map((announcement) => (
            <Link
              key={announcement.id}
              href={`/announcements/${announcement.id}`}
              prefetch={false}
              className="block rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-stone-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-semibold text-brand-900">{announcement.title}</h4>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-600">{announcement.content}</p>
                </div>
                {!announcement.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-danger" />}
              </div>
              <p className="mt-2 text-xs text-stone-500">
                {announcement.senderRole} - <LocalDateTime value={announcement.createdAtIso} />
              </p>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
