import Link from "next/link";
import { db } from "@/db";
import { tickets, staff, students } from "@/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Ticket, Clock, CheckCircle2, AlertCircle, Send, PlayCircle } from "lucide-react";
import { updateTicketStatusAction, forwardTicketAction } from "@/app/actions/helpdesk-actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";

const TICKETS_LIMIT = 50;

const FILTERS = [
  { value: "open", label: "Open & Working" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
] as const;
type TicketFilter = typeof FILTERS[number]["value"];

export default async function InstitutionHelpdeskPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    redirect("/login");
  }

  const institutionId = session.institutionId!;

  const filter: TicketFilter = FILTERS.some((f) => f.value === resolvedSearchParams.filter)
    ? (resolvedSearchParams.filter as TicketFilter)
    : "open";

  const filterCondition = filter === "resolved"
    ? eq(tickets.status, "RESOLVED")
    : filter === "all"
      ? undefined
      : inArray(tickets.status, ["OPEN", "WORKING"]);

  // Default view shows only actionable (open/working) tickets, capped, so we don't
  // load the entire ticket history on every visit. "All"/"Resolved" is opt-in.
  const allTickets = await db.select()
    .from(tickets)
    .where(filterCondition ? and(eq(tickets.institutionId, institutionId), filterCondition) : eq(tickets.institutionId, institutionId))
    .orderBy(desc(tickets.createdAt))
    .limit(TICKETS_LIMIT);

  const staffCreatorIds = Array.from(new Set(allTickets.filter((t) => t.creatorRole === "STAFF").map((t) => t.creatorId)));
  const studentCreatorIds = Array.from(new Set(allTickets.filter((t) => t.creatorRole === "STUDENT").map((t) => t.creatorId)));

  const [allStaff, allStudents] = await Promise.all([
    staffCreatorIds.length
      ? db.select({ id: staff.id, name: staff.name }).from(staff).where(and(eq(staff.institutionId, institutionId), inArray(staff.id, staffCreatorIds)))
      : Promise.resolve([]),
    studentCreatorIds.length
      ? db.select({ id: students.id, name: students.name }).from(students).where(and(eq(students.institutionId, institutionId), inArray(students.id, studentCreatorIds)))
      : Promise.resolve([]),
  ]);

  const staffMap = new Map(allStaff.map(s => [s.id, s.name]));
  const studentMap = new Map(allStudents.map(s => [s.id, s.name]));

  async function handleStatusChange(formData: FormData) {
    "use server";
    const ticketId = parseInt(formData.get("ticketId") as string, 10);
    const status = formData.get("status") as "WORKING" | "RESOLVED";
    await updateTicketStatusAction(ticketId, status);
  }

  async function handleForward(formData: FormData) {
    "use server";
    const ticketId = parseInt(formData.get("ticketId") as string, 10);
    await forwardTicketAction(ticketId);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Helpdesk Tickets</h1>
        <p className="text-stone-500 mt-1">Manage support requests from your students and staff.</p>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Ticket className="h-5 w-5 text-brand-600" />
                Recent Tickets
              </CardTitle>
              <CardDescription>
                Tickets can be resolved locally or forwarded to platform support.
              </CardDescription>
            </div>
            <div className="flex gap-1 rounded-md bg-stone-100 p-1">
              {FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={f.value === "open" ? "/institution/helpdesk" : `/institution/helpdesk?filter=${f.value}`}
                  prefetch={false}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === f.value ? "bg-white text-brand-900 shadow-sm" : "text-stone-600 hover:text-brand-800"
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {allTickets.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-stone-500">
              <Ticket className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p>No tickets found for this filter.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {allTickets.map((ticket) => {
                const creatorName = ticket.creatorRole === "STAFF" 
                  ? staffMap.get(ticket.creatorId) || "Unknown Staff"
                  : studentMap.get(ticket.creatorId) || "Unknown Student";

                return (
                  <li key={ticket.id} className="p-6 hover:bg-stone-50/50 transition-colors">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg text-stone-900">{ticket.title}</h3>
                          {ticket.status === 'OPEN' && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Open</span>}
                          {ticket.status === 'WORKING' && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Working</span>}
                          {ticket.status === 'RESOLVED' && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</span>}
                          {ticket.isForwarded && <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-medium flex items-center gap-1"><Send className="w-3 h-3" /> Forwarded ({ticket.platformStatus})</span>}
                        </div>
                        <p className="text-sm text-stone-500">
                          By <span className="font-medium text-stone-700">{creatorName}</span> ({ticket.creatorRole.toLowerCase()}) on {new Date(ticket.createdAt).toLocaleDateString()}
                        </p>
                        <p className="text-stone-700 mt-2">{ticket.description}</p>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 sm:w-48">
                        {ticket.status !== 'RESOLVED' && (
                          <>
                            {ticket.status === 'OPEN' && (
                              <form action={handleStatusChange}>
                                <input type="hidden" name="ticketId" value={ticket.id} />
                                <input type="hidden" name="status" value="WORKING" />
                                <SubmitButton className="w-full bg-yellow-600 hover:bg-yellow-700 text-white" size="sm">
                                  <PlayCircle className="w-4 h-4 mr-2" /> Mark Working
                                </SubmitButton>
                              </form>
                            )}
                            <form action={handleStatusChange}>
                              <input type="hidden" name="ticketId" value={ticket.id} />
                              <input type="hidden" name="status" value="RESOLVED" />
                              <SubmitButton className="w-full bg-green-600 hover:bg-green-700 text-white" size="sm">
                                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Resolved
                              </SubmitButton>
                            </form>
                            <form action={handleForward}>
                              <input type="hidden" name="ticketId" value={ticket.id} />
                              <SubmitButton className="w-full" variant="outline" size="sm">
                                <Send className="w-4 h-4 mr-2" /> Forward to Platform
                              </SubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {allTickets.length === TICKETS_LIMIT && (
            <p className="px-6 py-3 text-xs text-stone-500 border-t border-border bg-stone-50/50">
              Showing the most recent {TICKETS_LIMIT} tickets for this filter.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
