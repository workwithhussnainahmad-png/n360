import type { ChangeEvent } from 'react';
import { useState } from 'react';
import Image from 'next/image';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IMAGE_FILE_ACCEPT, prepareContentUpload } from '@/lib/client-upload-file';

export async function uploadPublicImage(file: File) {
  const preparedFile = await prepareContentUpload(file, { allowedKinds: ['image'] });
  const signatureResponse = await fetch('/api/institution/public-site/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signature' }) });
  const signature = await signatureResponse.json();
  if (!signatureResponse.ok) throw new Error(signature.error || 'Unable to prepare image upload');
  const form = new FormData();
  form.append('file', preparedFile); form.append('api_key', signature.apiKey); form.append('timestamp', String(signature.timestamp)); form.append('signature', signature.signature); form.append('folder', signature.folder); form.append('allowed_formats', signature.allowedFormats); form.append('type', signature.type);
  const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: 'POST', body: form });
  const uploaded = await uploadResponse.json();
  if (!uploadResponse.ok) throw new Error(uploaded.error?.message || 'Image upload failed');
  const completeResponse = await fetch('/api/institution/public-site/images', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete', publicId: uploaded.public_id, format: uploaded.format, resourceType: uploaded.resource_type }) });
  const completed = await completeResponse.json();
  if (!completeResponse.ok) throw new Error(completed.error || 'Unable to verify uploaded image');
  return completed.url as string;
}

export function ImageUploader({ value, onChange, label }: { value: string; onChange: (url: string) => void; label: string }) {
  const [uploading, setUploading] = useState(false);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setUploading(true);
    try { onChange(await uploadPublicImage(file)); } catch (error) { window.alert(error instanceof Error ? error.message : 'Image upload failed'); } finally { setUploading(false); }
  }
  
  const blurDataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  return <div className="space-y-3">{value && <div className="relative aspect-[16/7] overflow-hidden rounded-lg border border-stone-200 bg-stone-100"><Image placeholder="blur" blurDataURL={blurDataURL} unoptimized fill sizes="700px" src={value} alt="" className="object-cover" /></div>}<div className="flex flex-wrap gap-2"><label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-brand-800 ${uploading ? 'pointer-events-none opacity-60' : ''}`}><Upload className="h-4 w-4" />{uploading ? 'Uploading...' : value ? `Replace ${label}` : `Upload ${label}`}<input type="file" accept={IMAGE_FILE_ACCEPT} className="sr-only" disabled={uploading} onChange={upload} /></label>{value && <Button type="button" size="sm" variant="outline" onClick={() => onChange('')}>Remove</Button>}</div></div>;
}
