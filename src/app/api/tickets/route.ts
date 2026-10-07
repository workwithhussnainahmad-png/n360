import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets, ticketHistory } from "@/db/schema";
import { eq, and, desc, lt, or } from "drizzle-orm";
import { getSessionFromRequest, getLightSessionFromRequest } from "@/lib/auth";
import { z } from "zod";

const createTicketSchema = z.object({
  title: z.string().min(1, "Title is required").max(255),
  description: z.string().min(1, "Description is required"),
});

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

type TicketsCursor = { createdAt: Date; id: number };

function parseTicketsCursor(value: string | null): TicketsCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { createdAt?: unknown; id?: unknown };
    const createdAt = new Date(typeof parsed.createdAt === "string" ? parsed.createdAt : "");
    const id = Number(parsed.id);
    if (Number.isNaN(createdAt.getTime()) || !Number.isInteger(id) || id <= 0) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeTicketsCursor({ createdAt, id }: TicketsCursor) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString("base64url");
}

export async function GET(req: NextRequest) {
  try {
    const user = await getLightSessionFromRequest(req);
    if (!user || (user.role !== "STUDENT" && user.role !== "STAFF")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limitParam = Number(req.nextUrl.searchParams.get("limit"));
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const cursorParam = req.nextUrl.searchParams.get("cursor");
    const cursor = parseTicketsCursor(cursorParam);
    if (cursorParam && !cursor) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

    const conditions = [
      eq(tickets.creatorId, user.userId),
      eq(tickets.creatorRole, user.role),
    ];
    if (cursor) {
      const cursorCondition = or(
        lt(tickets.createdAt, cursor.createdAt),
        and(eq(tickets.createdAt, cursor.createdAt), lt(tickets.id, cursor.id))
      );
      if (cursorCondition) conditions.push(cursorCondition);
    }

    const ticketPage = await db.select({
      id: tickets.id,
      title: tickets.title,
      description: tickets.description,
      status: tickets.status,
      createdAt: tickets.createdAt,
    })
      .from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt), desc(tickets.id))
      .limit(limit + 1);

    const hasNextPage = ticketPage.length > limit;
    const userTickets = hasNextPage ? ticketPage.slice(0, limit) : ticketPage;
    const lastTicket = userTickets.at(-1);

    return NextResponse.json({
      tickets: userTickets,
      nextCursor: hasNextPage && lastTicket
        ? encodeTicketsCursor({ createdAt: lastTicket.createdAt, id: lastTicket.id })
        : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionFromRequest(req);
    if (!user || (user.role !== "STUDENT" && user.role !== "STAFF")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    if (!user.institutionId) {
      return NextResponse.json({ error: "Institution not found" }, { status: 400 });
    }

    const body = await req.json();
    const { title, description } = createTicketSchema.parse(body);

    const [ticket] = await db.insert(tickets).values({
      institutionId: user.institutionId,
      creatorRole: user.role,
      creatorId: user.userId,
      title,
      description,
      status: "OPEN",
    }).returning({ id: tickets.id });

    await db.insert(ticketHistory).values({
      ticketId: ticket.id,
      actorRole: user.role,
      actorId: user.userId,
      action: "CREATED",
      notes: "Ticket created",
    });

    return NextResponse.json({ success: true, ticketId: ticket.id });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0].message }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
