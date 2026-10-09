import Papa from "papaparse";

export type StudentCsvRow = { rowNumber: number; values: Record<string, string> };
export function parseStudentCsv(text: string): { rows: StudentCsvRow[]; errors: string[] } {
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), { skipEmptyLines: "greedy" });
  const errors = parsed.errors.map((error) => `Row ${(error.row ?? 0) + 1}: ${error.message}`);
  if (errors.length || !parsed.data.length) return { rows: [], errors };
  const headers = parsed.data[0].map((header) => header.trim().toLowerCase());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    return { rows: [], errors: ["Row 1: column names must be non-empty and unique."] };
  }
  const rows = parsed.data.slice(1).map((cells, index) => {
    const rowNumber = index + 2;
    if (cells.length !== headers.length) errors.push(`Row ${rowNumber}: expected ${headers.length} columns, found ${cells.length}.`);
    return { rowNumber, values: Object.fromEntries(headers.map((header, i) => [header, cells[i]?.trim() || ""])) };
  });
  return { rows, errors };
}

export type ImportRoll = { rowNumber: number; classId: number; classRollNumber: string };
export function studentImportRollErrors(rows: ImportRoll[], existing: Array<{ classId: number; classRollNumber: string }>) {
  const stored = new Set(existing.map((row) => JSON.stringify([row.classId, row.classRollNumber])));
  const grouped = new Map<string, ImportRoll[]>();
  for (const row of rows) {
    const key = JSON.stringify([row.classId, row.classRollNumber]);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return rows.flatMap((row) => {
    const key = JSON.stringify([row.classId, row.classRollNumber]);
    const matches = grouped.get(key)!;
    const errors: string[] = [];
    if (matches.length > 1) errors.push(`Row ${row.rowNumber}: roll number "${row.classRollNumber}" in this class is repeated in CSV rows ${matches.map((item) => item.rowNumber).join(", ")}.`);
    if (stored.has(key)) errors.push(`Row ${row.rowNumber}: roll number "${row.classRollNumber}" already exists in this class.`);
    return errors;
  });
}
