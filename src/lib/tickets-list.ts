import { db } from "@/db";
import { tickets } from "@/db/schema";
import type { UserRole } from "@/lib/auth-types";
import { and, desc, eq } from "drizzle-orm";

const DEFAULT_PAGE_SIZE = 25;

export type SupportTicketDto = {
  id: number;
  title: string;
  description: string;
  status: "OPEN" | "WORKING" | "RESOLVED" | "FORWARDED";
  createdAt: string;
};

export async function listCreatorTickets(
  role: Extract<UserRole, "STUDENT" | "STAFF">,
  userId: number,
  institutionId: number,
  limit = DEFAULT_PAGE_SIZE,
): Promise<{ tickets: SupportTicketDto[]; nextCursor: string | null }> {
  const rows = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .where(and(
      eq(tickets.institutionId, institutionId),
      eq(tickets.creatorId, userId),
      eq(tickets.creatorRole, role),
    ))
    .orderBy(desc(tickets.createdAt), desc(tickets.id))
    .limit(limit + 1);

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;
  const last = page.at(-1);

  return {
    tickets: page.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
    })),
    nextCursor:
      hasNext && last
        ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString("base64url")
        : null,
  };
}
