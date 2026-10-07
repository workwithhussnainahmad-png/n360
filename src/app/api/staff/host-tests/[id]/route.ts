import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { onlineTests, tests } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { eq, and } from "drizzle-orm";

export const DELETE = requireRole(["STAFF"], async (req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = (await params)?.id;
  const testId = Number(id);
  if (!Number.isInteger(testId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  try {
    const [test] = await db.select().from(tests).where(and(
      eq(tests.id, testId),
      eq(tests.institutionId, session.institutionId)
    )).limit(1);

    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });
    if (test.staffId !== session.userId) return NextResponse.json({ error: "You can only delete tests you hosted" }, { status: 403 });

    // Drizzle schema handles cascading deletes for online_tests, marks, questions, and submissions
    await db.delete(tests).where(and(
      eq(tests.id, testId),
      eq(tests.institutionId, session.institutionId),
    ));

    return NextResponse.json({ success: true, message: "Test deleted successfully" });
  } catch (error) {
    console.error("Error deleting hosted test:", error);
    return NextResponse.json({ error: "Failed to delete test" }, { status: 500 });
  }
});

export const PATCH = requireRole(["STAFF"], async (req: NextRequest, { session, params }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = (await params)?.id;
  const testId = Number(id);
  if (!Number.isInteger(testId)) return NextResponse.json({ error: "Invalid test ID" }, { status: 400 });

  try {
    const body = await req.json();
    const title = String(body.title || "").trim();
    const durationMinutes = Number(body.durationMinutes);

    if (!title) return NextResponse.json({ error: "Test title is required" }, { status: 400 });

    const [test] = await db.select().from(tests).where(and(
      eq(tests.id, testId),
      eq(tests.institutionId, session.institutionId)
    )).limit(1);

    if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 });
    if (test.staffId !== session.userId) return NextResponse.json({ error: "You can only edit tests you hosted" }, { status: 403 });

    // Update test title
    await db.update(tests).set({ title }).where(and(
      eq(tests.id, testId),
      eq(tests.institutionId, session.institutionId),
    ));

    // Update online test duration if applicable
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
      await db.update(onlineTests).set({ durationMinutes }).where(and(
        eq(onlineTests.testId, testId),
        eq(onlineTests.institutionId, session.institutionId),
      ));
    }

    return NextResponse.json({ success: true, message: "Test updated successfully" });
  } catch (error) {
    console.error("Error updating hosted test:", error);
    return NextResponse.json({ error: "Failed to update test" }, { status: 500 });
  }
});
