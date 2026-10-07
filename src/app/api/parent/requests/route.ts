import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { leaveRequests, parentStudents, sections, students, ticketHistory, tickets } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { createNotification } from "@/lib/notifications";

const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("LEAVE"), studentId: z.number().int().positive(), reason: z.string().trim().min(5).max(1000), startDate: z.string().date(), endDate: z.string().date(), parentPhone: z.string().trim().min(5).max(50) }),
  z.object({ kind: z.literal("SUPPORT"), studentId: z.number().int().positive(), title: z.string().trim().min(3).max(255), description: z.string().trim().min(5).max(3000) }),
]);

export const POST = requireRole(["PARENT"], async (req: NextRequest, { session }) => {
  const institutionId = session.institutionId!;
  try {
    const input = schema.parse(await req.json());
    const [linked] = await db.select({ studentId: students.id, studentName: students.name, sectionId: students.sectionId })
      .from(parentStudents).innerJoin(students, eq(parentStudents.studentId, students.id))
      .where(and(eq(parentStudents.institutionId, institutionId), eq(parentStudents.parentId, session.userId), eq(parentStudents.studentId, input.studentId), eq(students.institutionId, institutionId))).limit(1);
    if (!linked) return NextResponse.json({ error: "Student is not linked to this parent account" }, { status: 404 });

    if (input.kind === "LEAVE") {
      if (input.startDate > input.endDate) return NextResponse.json({ error: "Start date must be before or equal to end date" }, { status: 400 });
      const [created] = await db.insert(leaveRequests).values({ institutionId, userRole: "STUDENT", userId: linked.studentId, reason: input.reason, startDate: input.startDate, endDate: input.endDate, parentPhone: input.parentPhone, status: "PENDING" }).returning({ id: leaveRequests.id });
      const [section] = await db.select({ teacherId: sections.classTeacherId }).from(sections).where(and(eq(sections.institutionId, institutionId), eq(sections.id, linked.sectionId))).limit(1);
      await createNotification({ institutionId, userRole: section?.teacherId ? "STAFF" : "INSTITUTION", userId: section?.teacherId || institutionId, type: "LEAVE_REQUEST", title: "New parent leave request", message: `${linked.studentName}'s parent requested leave from ${input.startDate} to ${input.endDate}.`, referenceId: created.id });
      return NextResponse.json({ success: true, id: created.id });
    }

    const [ticket] = await db.insert(tickets).values({ institutionId, creatorRole: "PARENT", creatorId: session.userId, title: input.title, description: `[Student: ${linked.studentName}]\n${input.description}`, status: "OPEN" }).returning({ id: tickets.id });
    await db.insert(ticketHistory).values({ ticketId: ticket.id, actorRole: "PARENT", actorId: session.userId, action: "CREATED", notes: "Ticket created from parent portal" });
    return NextResponse.json({ success: true, id: ticket.id });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Invalid request" }, { status: 400 });
    console.error("Parent request error:", error);
    return NextResponse.json({ error: "Could not submit request" }, { status: 500 });
  }
});
