type Signature = { cloudName: string; apiKey: string; folder: string; timestamp: number; signature: string; allowedFormats: string; type?: string; overwrite?: boolean };
export async function uploadPaymentImage(file: File, signature: Signature) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Choose a JPG, PNG, or WebP image up to 5 MB.');
  const form = new FormData();
  form.set('file', file); form.set('api_key', signature.apiKey); form.set('timestamp', String(signature.timestamp));
  form.set('signature', signature.signature); form.set('folder', signature.folder); form.set('allowed_formats', signature.allowedFormats);
  if (signature.overwrite !== undefined) form.set('overwrite', String(signature.overwrite));
  if (signature.type) form.set('type', signature.type);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: 'POST', body: form });
  const asset = await response.json();
  if (!response.ok) throw new Error(asset.error?.message || 'Image upload failed.');
  return { publicId: asset.public_id as string, format: asset.format as string, resourceType: 'image' as const };
}
