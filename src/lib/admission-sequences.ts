import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Allocates a permanent per-institution, per-admission-year sequence safely. */
export async function allocateAdmissionSequences(institutionId: number, admissionYear: number, count = 1) {
  if (!Number.isInteger(count) || count < 1) throw new Error("Invalid admission sequence count");
  const result = await db.execute(sql`
    INSERT INTO student_admission_counters (institution_id, admission_year, next_sequence)
    VALUES (${institutionId}, ${admissionYear}, ${count + 1})
    ON CONFLICT (institution_id, admission_year)
    DO UPDATE SET next_sequence = student_admission_counters.next_sequence + ${count}
    RETURNING next_sequence - ${count} AS first_sequence
  `);
  const firstSequence = Number((result.rows[0] as { first_sequence: number | string } | undefined)?.first_sequence);
  if (!Number.isInteger(firstSequence) || firstSequence < 1) throw new Error("Could not allocate admission sequence");
  return Array.from({ length: count }, (_, index) => firstSequence + index);
}
