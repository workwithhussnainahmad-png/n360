import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalDateTime } from "@/components/LocalDateTime";
import { getSession } from "@/lib/auth";
import { getVisibleAnnouncementById, markAnnouncementRead } from "@/lib/announcements";
import { ArrowLeft, CalendarClock, CheckCircle2, Megaphone, Target, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

function portalHref(role: string) {
  if (role === "SUPER_ADMIN") return "/sa/dashboard";
  if (role === "EMPLOYEE") return "/employee/dashboard";
  if (role === "INSTITUTION") return "/institution/dashboard";
  if (role === "STAFF") return "/staff/dashboard";
  if (role === "STUDENT") return "/student/dashboard";
  return "/login";
}

function roleLabel(role: string) {
  return role.replace("_", " ");
}

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const announcementId = Number(id);
  if (!Number.isInteger(announcementId) || announcementId <= 0) notFound();

  const announcement = await getVisibleAnnouncementById(session, announcementId);
  if (!announcement) notFound();

  await markAnnouncementRead(session, announcementId);

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-brand-950 text-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-4 sm:py-8 sm:px-6 lg:px-8">
          <Link
            href={portalHref(session.role)}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to portal
          </Link>

          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-100">
              <Megaphone className="h-4 w-4" />
              Announcement
            </div>
            <div className="max-w-4xl">
              <h1 className="text-3xl font-display font-bold leading-tight sm:text-4xl lg:text-5xl">
                {announcement.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-brand-100 sm:text-base">
                This notice has been marked as read for your account.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_280px] lg:px-8 lg:py-8">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border bg-stone-50/70">
            <CardTitle className="flex items-center gap-2 text-lg text-brand-950">
              <Megaphone className="h-5 w-5 text-brand-700" />
              Notice Details
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 sm:p-8">
            <article className="prose prose-stone max-w-none">
              <p className="whitespace-pre-wrap text-base leading-8 text-stone-700">{announcement.content}</p>
            </article>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-5">
              <MetaItem icon={Target} label="Audience" value={announcement.targetType} />
              <MetaItem icon={UserRound} label="From" value={roleLabel(announcement.senderRole)} />
              <MetaItem icon={CalendarClock} label="Published" value={<LocalDateTime value={announcement.createdAtIso} />} />
              <MetaItem icon={CheckCircle2} label="Status" value="Read" />
            </CardContent>
          </Card>

          <Card className="border-brand-100 bg-brand-50/70">
            <CardContent className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-700">Tip</p>
              <p className="mt-2 text-sm leading-6 text-brand-900">
                You can also open recent announcements from the bell icon in the top bar.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-stone-100 text-brand-700">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold capitalize text-brand-950">{value}</p>
      </div>
    </div>
  );
}
