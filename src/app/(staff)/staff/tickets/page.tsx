import { TicketsClient } from "@/components/tickets/TicketsClient";
import { getSession } from "@/lib/auth";
import { listCreatorTickets } from "@/lib/tickets-list";
import { redirect } from "next/navigation";

export default async function StaffTicketsPage() {
  const session = await getSession();
  if (!session || session.role !== "STAFF" || !session.institutionId) redirect("/login");
  if (!session.institutionId) return null;
  const { tickets, nextCursor } = await listCreatorTickets("STAFF", session.userId, session.institutionId);
  return <TicketsClient initialTickets={tickets} initialNextCursor={nextCursor} />;
}
