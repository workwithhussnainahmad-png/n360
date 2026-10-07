import { ChangeEvent, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { IMAGE_FILE_ACCEPT, prepareContentUpload } from '@/lib/client-upload-file';
import { preserveElementPosition } from './EditorSection';

export function ImageUploadButton({ onUploaded, label = 'Choose image', disabled = false }: { onUploaded: (url: string) => void; label?: string; disabled?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const labelRef = useRef<HTMLLabelElement>(null);
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
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
      const section = labelRef.current?.closest<HTMLElement>('[data-editor-section]') || labelRef.current;
      preserveElementPosition(section, () => onUploaded(completed.url));
    } catch (error) { window.alert(error instanceof Error ? error.message : 'Image upload failed'); }
    finally { setUploading(false); }
  }
  return <label ref={labelRef} className={`inline-flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-brand-800 transition hover:border-brand-300 ${disabled || uploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}><Upload className="h-4 w-4" />{uploading ? 'Compressing and uploading...' : label}<input type="file" accept={IMAGE_FILE_ACCEPT} className="sr-only" disabled={disabled || uploading} onChange={upload} /></label>;
}
