import { sql } from 'drizzle-orm';
import { admissionCycles, institutions } from '@/db/schema';
import { openAdmissionCampusExistsSql } from '@/lib/admission-campus';
import { admissionCalendarDateSql } from '@/lib/admission-calendar';

const admissionToday = admissionCalendarDateSql();
// Shared by the public website and its preview; availability is evaluated in fresh SQL.
export const publicAdmissionsEnabledSql = sql<boolean>`${institutions.admissionsEnabled} AND EXISTS (
            SELECT 1 FROM ${admissionCycles}
            WHERE ${admissionCycles.institutionId} = ${institutions.id}
              AND ${admissionCycles.status} = 'OPEN'
              AND (${admissionCycles.opensOn} IS NULL OR ${admissionCycles.opensOn} <= ${admissionToday})
              AND (${admissionCycles.closesOn} IS NULL OR ${admissionCycles.closesOn} >= ${admissionToday})
              AND ${openAdmissionCampusExistsSql(admissionCycles.id, institutions.id)}
          )`;

