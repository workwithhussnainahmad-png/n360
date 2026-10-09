/** Translate expected PostgreSQL input conflicts without exposing SQL or values. */
export function databaseInputError(error: unknown): { status: number; body: { error: string; code: string; fieldErrors?: Record<string, string[]> } } | null {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const value = current as { code?: string; constraint?: string; cause?: unknown };
    if (value.code === '23505') {
      const fields: Record<string, [string, string]> = {
        inst_class_roll_unique: ['classRollNumber', 'This class roll number is already assigned to another student in this class.'],
        fee_heads_institution_name_unique: ['name', 'A fee head with this name already exists.'],
        institutions_username_unique: ['username', 'This institution username is already in use.'],
        admission_cycles_institution_name_unique: ['name', 'An admission cycle with this name already exists.'],
        public_events_institution_slug_uidx: ['slug', 'An event with this URL name already exists.'],
        staff_time_slot_unique: ['staffId', 'This staff member is already assigned during this time.'],
        section_time_slot_unique: ['sectionId', 'This section already has a lesson during this time.'],
      };
      const field = fields[value.constraint || ''];
      return { status: 409, body: { error: field?.[1] || 'A record with these details already exists. Use a different value or update the existing record.', code: 'DUPLICATE_VALUE', ...(field ? { fieldErrors: { [field[0]]: [field[1]] } } : {}) } };
    }
    if (value.code === '23503') return { status: 409, body: { error: 'This record is linked to other data, or a selected record is no longer available. Refresh and check your selection.', code: 'LINKED_RECORD' } };
    if (value.code === '22001') return { status: 400, body: { error: 'An entered value is too long. Shorten it to the field’s character limit.', code: 'VALUE_TOO_LONG' } };
    if (value.code === '23502') return { status: 400, body: { error: 'A required value is missing. Complete the required fields and try again.', code: 'VALUE_REQUIRED' } };
    if (value.code === '22P02' || value.code === '22003') return { status: 400, body: { error: 'An entered value has an invalid format or is outside the allowed range.', code: 'INVALID_VALUE' } };
    current = value.cause;
  }
  return null;
}
