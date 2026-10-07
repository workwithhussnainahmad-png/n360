import { NextRequest, NextResponse } from "next/server";
import { getLightSessionFromRequest } from "@/lib/auth";

/**
 * Navigation availability — role/JWT metadata only.
 *
 * Previously ran multi-join business probes (open tests, exams, pending leaves,
 * fee flags, transcripts) on every authenticated shell mount. That
 * violated on-demand fetching: login + idle must not load section data.
 *
 * Web shell no longer calls this endpoint. Kept as a JWT-derived no-DB response
 * for any legacy clients; pages themselves authorize and empty-state when data
 * is absent.
 *
 * Cache: none (payload is derived from the verified token only).
 */
export async function GET(req: NextRequest) {
  const session = await getLightSessionFromRequest(req);
  if (!session) return NextResponse.json({});

  if (session.role === "STUDENT") {
    const activeStudent = session.studentAcademicStatus !== "GRADUATED";
    return NextResponse.json({
      activeStudent,
      studentTests: activeStudent,
      examTimetable: activeStudent,
      fees: activeStudent,
      transcripts: true,
    });
  }

  if (session.role === "STAFF") {
    return NextResponse.json({
      examTimetable: true,
      staffLeaves: false,
    });
  }

  if (session.role === "INSTITUTION" || session.role === "INSTITUTION_ADMIN") {
    return NextResponse.json({
      institutionLeaves: false,
    });
  }

  return NextResponse.json({});
}
