import { inputErrorResponse } from '@/lib/input-error-response';
import { validationError } from '@/lib/validation-errors';
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { staff, campuses } from "@/db/schema";
import { requireRole } from "@/lib/rbac";
import { and, eq, sql } from "drizzle-orm";
export { corsPreflight as OPTIONS } from "@/lib/cors";

// Compile SQL/row mapping once; every profile read still queries the database.
// The pool may assign a reusable name when protocol-level preparation is enabled.
function prepareProfile() {
  return db.select({
      id: staff.id, name: staff.name, email: staff.email, phone: staff.phone,
      profilePictureUrl: staff.profilePictureUrl, campusName: campuses.name,
    }).from(staff)
    .leftJoin(campuses, eq(staff.campusId, campuses.id))
    .where(and(eq(staff.id, sql.placeholder("userId")), eq(staff.institutionId, sql.placeholder("institutionId"))))
    .prepare('');
}
let profileQuery: ReturnType<typeof prepareProfile> | undefined;

export const GET = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [profile] = await (profileQuery ??= prepareProfile()).execute({ userId: session.userId, institutionId: session.institutionId });
    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    const allCampuses = req.nextUrl.searchParams.get("campuses") === "1"
      ? await db.select({ id: campuses.id, name: campuses.name }).from(campuses)
        .where(eq(campuses.institutionId, session.institutionId))
      : [];
    return NextResponse.json({ profile, campuses: allCampuses });
  } catch (error) {
    const publicInputError = inputErrorResponse(error);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    console.error("Error fetching profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
});

export const PATCH = requireRole(["STAFF"], async (req: NextRequest, { session }) => {
  if (!session.institutionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const parsed = (await import("@/lib/validators/staff")).updateStaffProfileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(validationError(parsed.error), { status: 400 });
  }

  await db.update(staff)
    .set({ 
      ...(parsed.data.profilePictureUrl && { profilePictureUrl: parsed.data.profilePictureUrl })
    })
    .where(and(eq(staff.id, session.userId), eq(staff.institutionId, session.institutionId)));

  return NextResponse.json({ message: "Profile updated successfully" });
});
