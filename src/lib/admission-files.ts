const ADMISSION_FILE_PREFIX = 'cloudinary-auth:';
const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const ALLOWED_RESOURCE_TYPES = new Set(['image', 'raw']);

export type AdmissionFileAsset = {
  publicId: string;
  format: string;
  resourceType: 'image' | 'raw';
};

export function encodeAdmissionFileAsset(asset: AdmissionFileAsset) {
  return `${ADMISSION_FILE_PREFIX}${Buffer.from(JSON.stringify(asset), 'utf8').toString('base64url')}`;
}

export function decodeAdmissionFileAsset(value: string): AdmissionFileAsset | null {
  if (!value.startsWith(ADMISSION_FILE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(ADMISSION_FILE_PREFIX.length), 'base64url').toString('utf8')) as Partial<AdmissionFileAsset>;
    const publicId = typeof parsed.publicId === 'string' ? parsed.publicId.trim() : '';
    const format = typeof parsed.format === 'string' ? parsed.format.trim().toLowerCase() : '';
    const resourceType = parsed.resourceType;
    if (!publicId || publicId.length > 240 || publicId.includes('..') || publicId.startsWith('/') || publicId.endsWith('/')) return null;
    if (!ALLOWED_FORMATS.has(format) || !resourceType || !ALLOWED_RESOURCE_TYPES.has(resourceType)) return null;
    return { publicId, format, resourceType: resourceType as AdmissionFileAsset['resourceType'] };
  } catch {
    return null;
  }
}

export function parseAdmissionUploadCompletion(body: object): AdmissionFileAsset | null {
  const candidate = body as Record<string, unknown>;
  if (candidate.resourceType !== 'image' && candidate.resourceType !== 'raw') return null;
  return decodeAdmissionFileAsset(encodeAdmissionFileAsset({
    publicId: typeof candidate.publicId === 'string' ? candidate.publicId : '',
    format: typeof candidate.format === 'string' ? candidate.format : '',
    resourceType: candidate.resourceType,
  }));
}

export function hasExactFolderPrefix(publicId: string, folder: string) {
  return publicId.startsWith(`${folder}/`) && publicId.length > folder.length + 1;
}
