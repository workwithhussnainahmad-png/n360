import Image from 'next/image';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImageUploadButton } from './ImageUploadButton';

export function SelectedImage({ src, alt, onReplace, onRemove, shape = 'wide' }: { src: string; alt: string; onReplace: (url: string) => void; onRemove: () => void; shape?: 'wide' | 'portrait' | 'document' }) {
  const blurDataURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  
  return <div className={`overflow-hidden rounded-lg border border-stone-200 bg-white ${shape === 'portrait' ? 'max-w-xs' : shape === 'document' ? 'max-w-3xl' : ''}`}>
    <div className={`relative bg-stone-100 ${shape === 'portrait' ? 'aspect-[4/5]' : shape === 'document' ? 'aspect-[4/3]' : 'aspect-[16/6]'}`}>
      <Image placeholder="blur" blurDataURL={blurDataURL} unoptimized fill sizes={shape === 'portrait' ? '320px' : '(max-width: 768px) 100vw, 900px'} src={src} alt={alt} className={shape === 'document' ? 'object-contain' : 'object-cover'} />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 p-3">
      <span className="text-xs font-medium text-stone-600">Image selected</span>
      <div className="flex items-center gap-2">
        <ImageUploadButton label="Replace" onUploaded={onReplace} />
        <Button type="button" size="sm" variant="outline" onClick={onRemove}><Trash2 className="mr-2 h-4 w-4" />Remove</Button>
      </div>
    </div>
  </div>;
}
