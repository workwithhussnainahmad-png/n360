import { NextRequest, NextResponse } from "next/server";
import { requireRole, getTenantContext } from "@/lib/rbac";
import { getInstitutionAcademicsData } from "@/lib/institution-academics-data";

// Lightweight sections list (id, classId, name) — used by forms like Publish Results
// that need to filter sections by class client-side without a heavier join.
export const GET = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  const institutionId = getTenantContext(session);

  const data = await getInstitutionAcademicsData(institutionId);
  const rows = data.sections.map(({ id, classId, name }) => ({ id, classId, name }));
  return NextResponse.json({ sections: rows }, { headers: { 'Cache-Control': 'no-store' } });
});
