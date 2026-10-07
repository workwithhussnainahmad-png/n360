import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const scopedTables = [
  "academicSessions",
  "admissionApplicantAccounts",
  "admissionApplicationEvents",
  "admissionApplications",
  "admissionAppointments",
  "admissionCycles",
  "admissionDocumentRequests",
  "admissionEnrollments",
  "admissionFeePayments",
  "admissionOfferings",
  "announcements",
  "assignments",
  "attendances",
  "auditLogs",
  "batchExams",
  "campuses",
  "classes",
  "classFeeItems",
  "courses",
  "diaries",
  "emailOutbox",
  "feeHeads",
  "feeInvoices",
  "feePayments",
  "feePaymentSubmissions",
  "feeVoucherCycles",
  "feeVouchers",
  "gradingScales",
  "institutionAdmins",
  "institutionBackups",
  "institutionCustomRoles",
  "institutionHolidays",
  "institutionOwners",
  "institutionPublicProfiles",
  "leaveRequests",
  "marks",
  "notifications",
  "onlineTestSubmissions",
  "onlineTests",
  "passwordResets",
  "platformReviews",
  "sections",
  "sectionGroups",
  "staff",
  "staffAssignments",
  "staffAttendances",
  "staffProfileChangeRequests",
  "staffTeachableSubjects",
  "studentAdmissionCounters",
  "studentFeeAdjustments",
  "studentPromotions",
  "students",
  "studentProfileChangeRequests",
  "subjects",
  "submissions",
  "tests",
  "tickets",
];

const ignoreDirs = new Set([".git", ".next", "node_modules"]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return ignoreDirs.has(entry.name) ? [] : walk(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

const offenders = [];
for (const file of walk(path.join(root, "src"))) {
  const relativeFile = path.relative(root, file);
  if (relativeFile.includes(`${path.sep}(superadmin)${path.sep}`) || relativeFile.includes(`${path.sep}(employee)${path.sep}`)) {
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  for (const table of scopedTables) {
    const re = new RegExp(`\\.(?:from|update|delete)\\(${table}\\)`, "g");
    let match;
    while ((match = re.exec(text))) {
      const context = text.slice(Math.max(0, match.index - 1200), match.index + 1400);
      const allowCrossTenant = context.includes(`tenant-audit: allow-cross-tenant ${table}`);
      if (allowCrossTenant) continue;
      if (!context.includes(`${table}.institutionId`) && !context.includes("institutionId")) {
        offenders.push(`${relativeFile}: possible unscoped ${table} query`);
      }
    }
  }
}

if (offenders.length > 0) {
  console.error("Tenant scope audit failed:");
  for (const offender of offenders) console.error(`- ${offender}`);
  process.exit(1);
}

console.log("Tenant scope audit passed.");
