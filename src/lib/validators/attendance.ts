import { z } from 'zod';

export const staffAttendanceSchema = z.object({
  date: z.iso.date(),
  records: z.array(z.object({
    staffId: z.coerce.number().int().positive(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']),
  })).min(1, 'Mark attendance for at least one staff member.'),
}).refine(data => new Set(data.records.map(record => record.staffId)).size === data.records.length, {
  path: ['records'], message: 'Each staff member must appear only once.',
});
