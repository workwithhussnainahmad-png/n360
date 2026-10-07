import { db } from "@/db";
import { tickets, institutions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Ticket, Clock, CheckCircle2, PlayCircle, Send, AlertCircle } from "lucide-react";
import { updateTicketPlatformStatusAction } from "@/app/actions/sa-actions";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function SATicketsPage() {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    redirect("/login/super-admin");
  }

  const forwardedTickets = await db.select({
    id: tickets.id,
    title: tickets.title,
    description: tickets.description,
    platformStatus: tickets.platformStatus,
    updatedAt: tickets.updatedAt,
    institutionName: institutions.name,
  })
    .from(tickets)
    .innerJoin(institutions, eq(tickets.institutionId, institutions.id))
    .where(eq(tickets.isForwarded, true))
    .orderBy(desc(tickets.createdAt));

  async function handleStatusChange(formData: FormData) {
    "use server";
    const ticketId = parseInt(formData.get("ticketId") as string, 10);
    const status = formData.get("status") as "WORKING" | "RESOLVED";
    await updateTicketPlatformStatusAction(ticketId, status);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-950">Platform Support Tickets</h1>
        <p className="text-stone-500 mt-1">Manage tickets forwarded from institutions.</p>
      </div>

      <Card>
        <CardHeader className="border-b border-border bg-stone-50/50">
          <CardTitle className="text-lg flex items-center gap-2">
            <Send className="h-5 w-5 text-brand-600" />
            Forwarded Tickets
          </CardTitle>
          <CardDescription>
            These tickets have been escalated by institution admins.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {forwardedTickets.length === 0 ? (
            <div className="p-4 sm:p-8 text-center text-stone-500">
              <Ticket className="w-12 h-12 text-stone-300 mx-auto mb-3" />
              <p>No tickets have been forwarded to platform support yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {forwardedTickets.map((ticket) => {
                const instName = ticket.institutionName || "Unknown Institution";

                return (
                  <li key={ticket.id} className="p-6 hover:bg-stone-50/50 transition-colors">
                    <div className="flex flex-col sm:flex-row justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg text-stone-900">{ticket.title}</h3>
                          {ticket.platformStatus === 'RECEIVED' && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Received</span>}
                          {ticket.platformStatus === 'WORKING' && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Working</span>}
                          {ticket.platformStatus === 'RESOLVED' && <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Resolved</span>}
                        </div>
                        <p className="text-sm text-stone-500">
                          From <span className="font-medium text-stone-700">{instName}</span> on {new Date(ticket.updatedAt).toLocaleDateString()}
                        </p>
                        <p className="text-stone-700 mt-2 bg-white p-3 rounded border shadow-sm">
                          {ticket.description}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 shrink-0 sm:w-48">
                        {ticket.platformStatus !== 'RESOLVED' && (
                          <>
                            {ticket.platformStatus === 'RECEIVED' && (
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
                          </>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
