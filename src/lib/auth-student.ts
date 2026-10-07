import type { JWTPayload } from './auth-types';
import type { FreshStudent } from './user';

// Private to the returned object: not a JWT claim, shared cache or API property.
const placements = new WeakMap<JWTPayload, Readonly<FreshStudent>>();

export function enrichFreshStudentSession(session: JWTPayload, student: FreshStudent | null): JWTPayload {
  if (session.role !== 'STUDENT' || !student || session.userId !== student.id || session.institutionId !== student.institutionId) return session;
  const enriched = { ...session, studentAcademicStatus: student.academicStatus, graduatedStudentAccessAllowed: student.graduatedAccessAllowed };
  placements.set(enriched, Object.freeze({ ...student }));
  return enriched;
}

export function getAuthenticatedStudentPlacement(session: JWTPayload): Readonly<FreshStudent> | undefined {
  const student = placements.get(session);
  return session.role === 'STUDENT' && student?.id === session.userId && student.institutionId === session.institutionId ? student : undefined;
}
