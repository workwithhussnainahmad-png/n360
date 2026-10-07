import { db } from "@/db";
import { announcements, campuses, classes, sections } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { LocalDateTime } from "@/components/LocalDateTime";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Megaphone, Trash2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAnnouncementAction, deleteAnnouncementAction } from "@/app/actions/institution-actions";
import { AnnouncementFormClient } from "./AnnouncementFormClient";
import { PaginationNav } from "@/components/ui/pagination-nav";

const ANNOUNCEMENTS_PER_PAGE = 10;

function audienceLabel(announcement: typeof announcements.$inferSelect) {
  if (announcement.targetType === "USER" && announcement.targetUserRole && !announcement.targetUserId) {
    return `${announcement.targetUserRole} ONLY`;
  }
  return announcement.targetType;
}

export default async function InstitutionAnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }
  const params = await searchParams;
  const currentPage = Math.max(1, Number(params.page) || 1);

  const institutionId = session.institutionId || session.userId;

  const offset = (currentPage - 1) * ANNOUNCEMENTS_PER_PAGE;
  const [paginatedAnnouncements, announcementCountRows, allCampuses, allClasses, allSections] = await Promise.all([
    db.select()
      .from(announcements)
      .where(eq(announcements.institutionId, institutionId))
      .orderBy(desc(announcements.createdAt))
      .limit(ANNOUNCEMENTS_PER_PAGE)
      .offset(offset),
    db.select({ value: count() })
      .from(announcements)
      .where(eq(announcements.institutionId, institutionId)),
    db.select().from(campuses).where(eq(campuses.institutionId, institutionId)),
    db.select().from(classes).where(eq(classes.institutionId, institutionId)),
    db.select().from(sections).where(eq(sections.institutionId, institutionId)),
  ]);
  const announcementCount = announcementCountRows[0]?.value ?? 0;
  const totalPages = Math.max(1, Math.ceil(announcementCount / ANNOUNCEMENTS_PER_PAGE));

  async function createAnnouncement(formData: FormData) {
    "use server";
    await createAnnouncementAction(formData);
  }

  async function deleteAnnouncement(formData: FormData) {
    "use server";
    await deleteAnnouncementAction(formData);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-950">Announcements</h1>
          <p className="text-stone-500 mt-1">Broadcast messages to staff and students.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="border-b border-border bg-stone-50/50">
              <CardTitle className="text-lg flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-brand-600" />
                Recent Broadcasts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-stone-500 uppercase bg-stone-50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-medium">Title</th>
                      <th className="px-6 py-4 font-medium">Target Audience</th>
                      <th className="px-6 py-4 font-medium">Date Sent</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {announcementCount === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 sm:py-8 text-center text-stone-500">
                          No announcements sent yet.
                        </td>
                      </tr>
                    )}
                    {paginatedAnnouncements.map((ann) => (
                      <tr key={ann.id} className="hover:bg-stone-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-brand-950">
                          <Link href={`/announcements/${ann.id}`} prefetch={false} className="hover:text-brand-700 hover:underline">
                            {ann.title}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-brand-100 text-brand-800 rounded-md">
                            {audienceLabel(ann)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-stone-500 whitespace-nowrap">
                          <LocalDateTime value={ann.createdAt.toISOString()} compact />
                        </td>
                        <td className="px-6 py-4">
                          <form action={deleteAnnouncement} className="flex justify-end">
                            <input type="hidden" name="announcementId" value={ann.id} />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-2 rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/15"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationNav currentPage={Math.min(currentPage, totalPages)} totalPages={totalPages} basePath="/institution/announcements" />
            </CardContent>
          </Card>
        </div>

        <div>
          <AnnouncementFormClient 
            campuses={allCampuses}
            classes={allClasses}
            sections={allSections}
            action={createAnnouncement}
          />
        </div>
      </div>
    </div>
  );
}
