'use client';

export const MAX_CONTENT_UPLOAD_BYTES = 5 * 1024 * 1024;

export const CONTENT_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.docx,.txt,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
export const IMAGE_FILE_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

type UploadKind = 'image' | 'pdf' | 'docx' | 'txt';

const FILE_TYPES: Record<UploadKind, { extensions: Set<string>; mimes: Set<string> }> = {
  image: { extensions: new Set(['jpg', 'jpeg', 'png', 'webp']), mimes: new Set(['image/jpeg', 'image/png', 'image/webp']) },
  pdf: { extensions: new Set(['pdf']), mimes: new Set(['application/pdf']) },
  docx: { extensions: new Set(['docx']), mimes: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']) },
  txt: { extensions: new Set(['txt']), mimes: new Set(['text/plain']) },
};

function extensionOf(name: string) {
  return name.toLowerCase().split('.').pop() || '';
}

function matchingKind(file: File, allowedKinds: readonly UploadKind[]) {
  const extension = extensionOf(file.name);
  return allowedKinds.find((kind) => FILE_TYPES[kind].extensions.has(extension) && FILE_TYPES[kind].mimes.has(file.type.toLowerCase()));
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Image compression failed')), type, quality));
}

async function compressImage(file: File, maximumBytes: number) {
  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, 2560 / Math.max(bitmap.width, bitmap.height));
    let quality = 0.82;
    let result: Blob | null = null;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Image compression is unavailable in this browser');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      result = await canvasBlob(canvas, 'image/webp', quality);
      if (result.size <= maximumBytes) break;
      scale *= 0.8;
      quality = Math.max(0.55, quality - 0.08);
    }

    if (!result || result.size > maximumBytes) throw new Error(`Image is still larger than ${Math.round(maximumBytes / 1024 / 1024)} MB after compression. Choose a smaller image.`);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([result], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export async function prepareContentUpload(file: File, options: { allowedKinds?: readonly UploadKind[]; maximumBytes?: number; compressImages?: boolean } = {}) {
  const allowedKinds = options.allowedKinds || ['image', 'pdf', 'docx', 'txt'];
  const maximumBytes = options.maximumBytes || MAX_CONTENT_UPLOAD_BYTES;
  const kind = matchingKind(file, allowedKinds);
  if (!kind) throw new Error(`Only ${allowedKinds.map((item) => item === 'image' ? 'JPG, PNG, or WebP' : item.toUpperCase()).join(', ')} files are allowed.`);
  if (kind === 'image' && options.compressImages !== false) return compressImage(file, maximumBytes);
  if (file.size > maximumBytes) throw new Error(`File must be ${Math.round(maximumBytes / 1024 / 1024)} MB or smaller.`);
  return file;
}
