import { after, NextRequest, NextResponse } from "next/server";
import { hashPassword as hash } from "@/lib/argon2-pool";
import { and, eq } from "drizzle-orm";
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

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((header) => normalize(header));
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index]?.trim() || "";
      return row;
    }, {});
  });
}

async function getOrCreateWholeClassSection(institutionId: number, classId: number) {
  const [existingSection] = await db.select({
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

  const [createdSection] = await db.insert(sections).values({
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

    const rows = parseCsv(await file.text());
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
    const passwordHash = await hash(initialPassword);

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
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
        errors.push(`Row ${rowNumber}: required fields are missing or invalid.`);
        continue;
      }

      const finalSection = sectionObj ?? await getOrCreateWholeClassSection(tenantId, classObj.id);
      preparedRows.push({
        institutionId: tenantId,
        campusId: parsed.data.campusId,
        name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
        gender: parsed.data.gender,
        passwordHash,
        classId: parsed.data.classId,
        sectionId: finalSection.id,
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

    const loginInstitution = await resolveStudentLoginInstitution(inst);
    const rowsByYear = new Map<number, PreparedStudentRow[]>();
    for (const row of preparedRows) rowsByYear.set(row.yearOfJoining, [...(rowsByYear.get(row.yearOfJoining) || []), row]);
    for (const [year, yearRows] of rowsByYear) {
      const sequences = await allocateAdmissionSequences(tenantId, year, yearRows.length);
      for (const [index, row] of yearRows.entries()) {
        row.admissionSequence = sequences[index];
        row.loginRollNumber = generateStudentLoginRollNumber({ institution: loginInstitution, yearOfJoining: year, admissionSequence: sequences[index] });
      }
    }

    const insertRows: Array<typeof students.$inferInsert> = preparedRows.map((row) => {
      if (!row.admissionSequence || !row.loginRollNumber) {
        throw new Error("Student admission sequence allocation failed.");
      }
      return {
        ...row,
        admissionSequence: row.admissionSequence,
        loginRollNumber: row.loginRollNumber,
      };
    });

    const inserted = await db.insert(students).values(insertRows).returning({ id: students.id });

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
    if (typeof err === "object" && err && "code" in err && err.code === "23505") {
      return NextResponse.json({ error: "One or more students already exist with the same login ID or class roll number." }, { status: 409 });
    }
    console.error("Bulk student import failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
});
