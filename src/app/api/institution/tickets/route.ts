import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireRole, getTenantContext } from "@/lib/rbac";

export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") || "active";

  const conditions = [eq(tickets.institutionId, institutionId)];
  
  if (filter === "active") {
    conditions.push(eq(tickets.status, "OPEN"));
  } else if (filter === "resolved") {
    conditions.push(eq(tickets.status, "RESOLVED"));
  }

  const result = await db.select()
    .from(tickets)
    .where(and(...conditions))
    .orderBy(desc(tickets.createdAt));

  return NextResponse.json({ tickets: result });
});

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);
  
  try {
    const body = await req.json();
    const { ticketId, action, status } = body;

    if (!ticketId) return NextResponse.json({ error: "Ticket ID required" }, { status: 400 });

    if (action === "updateStatus" && status) {
      await db.update(tickets)
        .set({ status })
        .where(and(eq(tickets.id, Number(ticketId)), eq(tickets.institutionId, institutionId)));
    }
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update ticket" }, { status: 500 });
  }
});
