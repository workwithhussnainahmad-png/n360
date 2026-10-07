type InstitutionLike = {
  type: string;
  username: string;
  parentInstitutionId?: number | null;
  parentUsername?: string | null;
  campusName?: string | null;
};


function appDomain() {
  return (process.env.NEXT_PUBLIC_APP_DOMAIN || "myapp.pk").trim();
}

function cleanAlphaNumeric(value: string) {
  return value.replace(/[^a-z0-9]/gi, "");
}

export function campusLoginSlug(name: string) {
  const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || slug.length > 63) throw new Error('Campus name must produce a login name of 1–63 letters, numbers or hyphens.');
  return slug;
}

/** Human-readable, globally unique workspace username within the existing 30-character column. */
export function campusUsernameCandidate(name: string, rootId: number, attempt = 0) {
  const suffix = attempt === 0 ? '' : `-${rootId}${attempt === 1 ? '' : `-${attempt}`}`;
  return `${campusLoginSlug(name).slice(0, 30 - suffix.length).replace(/-+$/, '')}${suffix}`;
}

export function generateStudentLoginRollNumber({
  institution,
  yearOfJoining,
  admissionSequence,
}: {
  institution: InstitutionLike;
  yearOfJoining: number;
  admissionSequence: number;
}) {
  const typeLetter = institution.type.charAt(0).toUpperCase();
  const yearLastTwo = yearOfJoining.toString().slice(-2);

  if (!typeLetter) throw new Error("Institution type is required to generate a student login ID");
  if (!Number.isInteger(admissionSequence) || admissionSequence < 1 || admissionSequence > 99_999_999) throw new Error("Invalid admission sequence");

  let namespace = institution.username;
  if (institution.parentInstitutionId != null) {
    if (!institution.parentUsername || !institution.campusName) throw new Error('Parent institution and campus name are required for a campus student login.');
    namespace = `${institution.parentUsername}.${campusLoginSlug(institution.campusName)}`;
  }
  return `${typeLetter}${yearLastTwo}-${String(admissionSequence).padStart(8, "0")}@${namespace}.${appDomain()}`;
}

export function generateStaffEmail({
  name,
  phone,
  institution,
}: {
  name: string;
  phone?: string | null;
  institution: Pick<InstitutionLike, "username">;
}) {
  const parts = name.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const firstInitial = cleanAlphaNumeric(parts[0] || "").charAt(0);
  const secondName = cleanAlphaNumeric(parts[1] || parts.slice(1).join("") || parts[0] || "").toLowerCase();
  const phoneDigits = (phone || "").replace(/\D/g, "");
  const phoneLastFour = phoneDigits.slice(-4);

  if (!firstInitial || !secondName) throw new Error("Staff name must include enough letters to generate an email");
  if (phoneLastFour.length !== 4) throw new Error("Staff phone number must include at least 4 digits");

  return `${firstInitial}${secondName}${phoneLastFour}@${institution.username}.${appDomain()}`;
}
