import type { JWTPayload } from '@/lib/auth-types';

function roleSegment(role: JWTPayload['role']) {
  return role.toLowerCase().replaceAll('_', '-');
}

/** Namespace every generic Cloudinary upload by tenant, role and account. */
export function ownedUploadFolder(session: JWTPayload) {
  const tenant = session.institutionId ?? (session.role === 'INSTITUTION' ? session.userId : 'platform');
  return `lms-uploads/tenant-${tenant}/${roleSegment(session.role)}/user-${session.userId}`;
}

export function ownsUploadPublicId(session: JWTPayload, publicId: string) {
  const folder = ownedUploadFolder(session);
  if (!publicId.startsWith(`${folder}/`) || publicId.length <= folder.length + 1 || publicId.includes('\\')) return false;
  const assetSegments = publicId.slice(folder.length + 1).split('/');
  return assetSegments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}
