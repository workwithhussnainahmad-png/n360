import { TicketsClient } from "@/components/tickets/TicketsClient";
import { getSession } from "@/lib/auth";
import { listCreatorTickets } from "@/lib/tickets-list";
import { redirect } from "next/navigation";

export default async function StudentTicketsPage() {
  const session = await getSession();
  if (!session || session.role !== "STUDENT" || !session.institutionId) redirect("/login");
  if (!session.institutionId) return null;
  const { tickets, nextCursor } = await listCreatorTickets("STUDENT", session.userId, session.institutionId);
  return <TicketsClient initialTickets={tickets} initialNextCursor={nextCursor} />;
}
