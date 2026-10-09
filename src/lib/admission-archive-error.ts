export const ARCHIVED_ADMISSION_MESSAGE = "Restore this archived admission cycle before changing its records.";

export function isArchivedAdmissionError(error: unknown): boolean {
  for (let depth = 0; error && typeof error === "object" && depth < 5; depth++) {
    if ("code" in error && error.code === "N3601") return true;
    error = "cause" in error ? error.cause : null;
  }
  return false;
}
