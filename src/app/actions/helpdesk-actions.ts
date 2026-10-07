"use server";

import { db } from "@/db";
import { tickets, ticketHistory } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function updateTicketStatusAction(ticketId: number, status: "WORKING" | "RESOLVED") {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    throw new Error("Unauthorized");
  }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket || ticket.institutionId !== session.institutionId && ticket.institutionId !== session.userId) {
    throw new Error("Ticket not found");
  }
  await db.update(tickets)
    .set({
      status,
      // Keep the platform view in sync when the ticket was escalated.
      ...(ticket.isForwarded ? { platformStatus: status } : {}),
    })
    .where(eq(tickets.id, ticketId));

  await db.insert(ticketHistory).values({
    ticketId,
    actorRole: session.role,
    actorId: session.userId,
    action: "STATUS_CHANGED",
    notes: `Status changed to ${status}`,
  });

  revalidatePath("/institution/helpdesk");
  revalidatePath("/sa/tickets");
  revalidatePath("/employee/tickets");
  revalidatePath("/student/tickets");
  revalidatePath("/staff/tickets");
  return { success: true };
}

export async function forwardTicketAction(ticketId: number) {
  const session = await getSession();
  if (!session || (session.role !== "INSTITUTION" && session.role !== "INSTITUTION_ADMIN")) {
    throw new Error("Unauthorized");
  }

  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
  if (!ticket || ticket.institutionId !== session.institutionId && ticket.institutionId !== session.userId) {
    throw new Error("Ticket not found");
  }
  if (ticket.isForwarded) {
    throw new Error("This ticket has already been forwarded to platform support");
  }

  await db.update(tickets)
    .set({ isForwarded: true, platformStatus: "RECEIVED" })
    .where(eq(tickets.id, ticketId));

  await db.insert(ticketHistory).values({
    ticketId,
    actorRole: session.role,
    actorId: session.userId,
    action: "FORWARDED",
    notes: "Ticket forwarded to platform support",
  });

  revalidatePath("/institution/helpdesk");
  revalidatePath("/sa/tickets");
  revalidatePath("/employee/tickets");
  return { success: true };
}
