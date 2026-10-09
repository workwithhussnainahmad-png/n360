import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { admissionCycleCampuses, admissionCycles, auditLogs, institutions } from "@/db/schema";
import type { UserRole } from "@/lib/auth";

export class AdmissionArchiveError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function setAdmissionCycleArchived(input: { institutionId: number; cycleId: number; archived: boolean; actorId: number; actorRole: UserRole; ip: string }) {
  return db.transaction(async (tx) => {
    const [cycle] = await tx.select().from(admissionCycles).where(and(eq(admissionCycles.id, input.cycleId), eq(admissionCycles.institutionId, input.institutionId))).for("update").limit(1);
    if (!cycle) throw new AdmissionArchiveError("Admission cycle not found", 404);
    if (Boolean(cycle.archivedAt) === input.archived) return;
    await tx.update(admissionCycles).set({ archivedAt: input.archived ? new Date() : null, status: "CLOSED", updatedAt: new Date() }).where(eq(admissionCycles.id, cycle.id));
    await tx.update(admissionCycleCampuses).set({ isOpen: false, updatedAt: new Date() }).where(eq(admissionCycleCampuses.cycleId, cycle.id));
    if (cycle.status === "OPEN") await tx.update(institutions).set({ admissionsEnabled: false }).where(eq(institutions.id, input.institutionId));
    await tx.insert(auditLogs).values({ institutionId: input.institutionId, actorId: input.actorId, actorRole: input.actorRole, action: input.archived ? "ARCHIVE_ADMISSION_CYCLE" : "RESTORE_ADMISSION_CYCLE", target: `Admission cycle ${cycle.id}`, ip: input.ip });
  });
}
