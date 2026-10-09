import { inputErrorResponse } from '@/lib/input-error-response';
import { parseStudentCsv, studentImportRollErrors, type ImportRoll } from "@/lib/student-import-csv";
import { after, NextRequest, NextResponse } from "next/server";
import { validationError } from '@/lib/validation-errors';
import { hashPassword as hash } from "@/lib/argon2-pool";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { campuses, classes, institutions, sections, students } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import { getClientIp } from "@/lib/client-ip";
import { generateStudentLoginRollNumber } from "@/lib/login-identifiers";
import { resolveStudentLoginInstitution } from "@/lib/student-login-institution";
import { allocateAdmissionSequences } from "@/lib/admission-sequences";
import { getTenantContext, requireRole } from "@/lib/rbac";
import { createStudentSchema } from "@/lib/validators/student";
import { withRateLimit } from "@/lib/rate-limit";
import { invalidateInstitutionRosterCaches } from "@/lib/redis";

const WHOLE_CLASS_SECTION_NAME = "Whole Class";
const MAX_IMPORT_ROWS = 500;

type CsvRow = Record<string, string>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PreparedStudentRow = Omit<typeof students.$inferInsert, "admissionSequence" | "loginRollNumber"> & {
  admissionSequence?: number;
  loginRollNumber?: string;
  yearOfJoining: number;
};

function normalize(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function csvValue(row: CsvRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[normalize(key)];
    if (value !== undefined && value !== "") return value.trim();
  }
  return "";
}

async function getOrCreateWholeClassSection(tx: Transaction, institutionId: number, classId: number) {
  const [existingSection] = await tx.select({
    id: sections.id,
    classId: sections.classId,
    name: sections.name,
  })
    .from(sections)
    .where(and(
      eq(sections.classId, classId),
      eq(sections.institutionId, institutionId),
      eq(sections.name, WHOLE_CLASS_SECTION_NAME)
    ))
    .limit(1);

  if (existingSection) return existingSection;

  const [createdSection] = await tx.insert(sections).values({
    institutionId,
    classId,
    name: WHOLE_CLASS_SECTION_NAME,
    classTeacherId: null,
  }).returning({
    id: sections.id,
    classId: sections.classId,
    name: sections.name,
  });

  return createdSection;
}

export const POST = requireRole(["INSTITUTION", "INSTITUTION_ADMIN"], async (req: NextRequest, { session }) => {
  try {
    const rateLimit = await withRateLimit(req, "import");
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const tenantId = getTenantContext(session);
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 });
    }

    const { rows, errors: csvErrors } = parseStudentCsv(await file.text());
    if (csvErrors.length) return NextResponse.json({ error: "Fix the CSV format and try again.", errors: csvErrors }, { status: 400 });
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV file has no student rows." }, { status: 400 });
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: `Import up to ${MAX_IMPORT_ROWS} students at a time.` }, { status: 400 });
    }

    const [[inst], campusRows, classRows, sectionRows] = await Promise.all([
      db.select({
        id: institutions.id,
        type: institutions.type,
        username: institutions.username,
        parentInstitutionId: institutions.parentInstitutionId,
        campusName: institutions.campusName,
      }).from(institutions).where(eq(institutions.id, tenantId)).limit(1),
      db.select({
        id: campuses.id,
        name: campuses.name,
      }).from(campuses).where(eq(campuses.institutionId, tenantId)),
      db.select({
        id: classes.id,
        name: classes.name,
      }).from(classes).where(eq(classes.institutionId, tenantId)),
      db.select({
        id: sections.id,
        classId: sections.classId,
        name: sections.name,
      }).from(sections).where(eq(sections.institutionId, tenantId)),
    ]);

    if (!inst) {
      return NextResponse.json({ error: "Institution not found." }, { status: 404 });
    }

    const errors: string[] = [];
    const preparedRows: PreparedStudentRow[] = [];
    const initialPassword = "1234567890";
    const rollRows: ImportRoll[] = [];

    for (const { rowNumber, values: row } of rows) {
      const campusInput = csvValue(row, "campusId", "campus");
      const classInput = csvValue(row, "classId", "class", "className");
      const sectionInput = csvValue(row, "sectionId", "section", "sectionName");

      const campus = campusRows.find((item) => item.id.toString() === campusInput || normalize(item.name) === normalize(campusInput));
      const classObj = classRows.find((item) => item.id.toString() === classInput || normalize(item.name) === normalize(classInput));
      const sectionObj = sectionInput && classObj
        ? sectionRows.find((item) => (
          item.classId === classObj.id
          && (item.id.toString() === sectionInput || normalize(item.name) === normalize(sectionInput))
        ))
        : undefined;

      if (!campus) errors.push(`Row ${rowNumber}: campus not found.`);
      if (!classObj) errors.push(`Row ${rowNumber}: class not found.`);
      if (sectionInput && !sectionObj) errors.push(`Row ${rowNumber}: section not found for selected class.`);

      if (!campus || !classObj || (sectionInput && !sectionObj)) continue;

      const parsed = createStudentSchema.safeParse({
        firstName: csvValue(row, "firstName", "first name"),
        lastName: csvValue(row, "lastName", "last name"),
        campusId: campus.id,
        classId: classObj.id,
        sectionId: sectionObj?.id,
        gender: (csvValue(row, "gender") || "MALE").toUpperCase(),
        yearOfJoining: csvValue(row, "yearOfJoining", "year", "joiningYear"),
        classRollNumber: csvValue(row, "classRollNumber", "rollNumber", "roll no", "class roll number"),
        phone: csvValue(row, "phone"),
      });

      if (!parsed.success) {
        errors.push(`Row ${rowNumber}: ${validationError(parsed.error).error}`);
        continue;
      }

      rollRows.push({ rowNumber, classId: classObj.id, classRollNumber: parsed.data.classRollNumber });
      preparedRows.push({
        institutionId: tenantId,
        campusId: parsed.data.campusId,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        gender: parsed.data.gender,
        passwordHash: "",
        classId: parsed.data.classId,
        sectionId: sectionObj?.id ?? 0,
        yearOfJoining: parsed.data.yearOfJoining,
        classRollNumber: parsed.data.classRollNumber,
        phone: parsed.data.phone,
        age: parsed.data.age,
        mustChangePassword: true,
        isActive: true,
      });
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Import failed. Fix the listed rows and try again.", errors }, { status: 400 });
    }

    const findConflicts = async (client: Pick<typeof db, "select">) => {
      const stored = await client.select({ classId: students.classId, classRollNumber: students.classRollNumber }).from(students)
        .where(and(eq(students.institutionId, tenantId), inArray(students.classId, [...new Set(rollRows.map(row => row.classId))])));
      return studentImportRollErrors(rollRows, stored);
    };
    const previewErrors = await findConflicts(db);
    if (previewErrors.length) return NextResponse.json({ error: "Fix the conflicting student rows and try again.", errors: previewErrors }, { status: 409 });
    const passwordHash = await hash(initialPassword);
    const loginInstitution = await resolveStudentLoginInstitution(inst);
    let inserted: Array<{ id: number }>;
    try {
      inserted = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(36073, ${tenantId})`);
        const conflicts = await findConflicts(tx);
        if (conflicts.length) throw Object.assign(new Error("IMPORT_CONFLICT"), { rowErrors: conflicts });
        const wholeClassByClass = new Map<number, number>();
        const rowsByYear = new Map<number, PreparedStudentRow[]>();
        for (const row of preparedRows) {
          row.passwordHash = passwordHash;
          if (!row.sectionId) {
            row.sectionId = wholeClassByClass.get(row.classId) ?? (await getOrCreateWholeClassSection(tx, tenantId, row.classId)).id;
            wholeClassByClass.set(row.classId, row.sectionId);
          }
          rowsByYear.set(row.yearOfJoining, [...(rowsByYear.get(row.yearOfJoining) || []), row]);
        }
        for (const [year, yearRows] of rowsByYear) {
          const sequences = await allocateAdmissionSequences(tenantId, year, yearRows.length, tx);
          for (const [index, row] of yearRows.entries()) {
            row.admissionSequence = sequences[index];
            row.loginRollNumber = generateStudentLoginRollNumber({ institution: loginInstitution, yearOfJoining: year, admissionSequence: sequences[index] });
          }
        }
        return tx.insert(students).values(preparedRows.map(row => {
          if (!row.admissionSequence || !row.loginRollNumber) throw new Error("Student admission sequence allocation failed.");
          return { ...row, admissionSequence: row.admissionSequence, loginRollNumber: row.loginRollNumber };
        })).returning({ id: students.id });
      });
    } catch (error) {
      if (error && typeof error === "object" && "rowErrors" in error) return NextResponse.json({ error: "Fix the conflicting student rows and try again.", errors: error.rowErrors }, { status: 409 });
      const conflicts = await findConflicts(db);
      if (conflicts.length) return NextResponse.json({ error: "Fix the conflicting student rows and try again.", errors: conflicts }, { status: 409 });
      throw error;
    }

    await invalidateInstitutionRosterCaches(tenantId);

    after(async () => {
      try {
        await logAudit({
          institutionId: tenantId,
          actorId: session.userId,
          actorRole: session.role,
          action: "BULK_IMPORT_STUDENTS",
          target: `${inserted.length} students`,
          ip: getClientIp(req),
        });
      } catch (auditError) {
        console.error("Bulk student import audit failed:", auditError);
      }
    });

    return NextResponse.json({
      message: "Students imported successfully",
      imported: inserted.length,
      initialPassword,
    }, { status: 201 });
  } catch (err: unknown) {
    const publicInputError = inputErrorResponse(err);
    if (publicInputError) return NextResponse.json(publicInputError.body, { status: publicInputError.status });

    if (typeof err === "object" && err && "code" in err && err.code === "23505") {
      return NextResponse.json({ error: "One or more students already exist with the same login ID or class roll number." }, { status: 409 });
    }
    console.error("Bulk student import failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
