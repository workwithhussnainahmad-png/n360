import type { CSSProperties, ReactNode } from 'react';
import Image from 'next/image';
import { Clock3 } from 'lucide-react';
import type { PublicEventBlock } from '@/lib/public-events';
import { safePublicLink, videoEmbedUrl } from '@/lib/public-site-builder';
import styles from './builder.module.css';

function Photo({ url, alt, caption }: { url: string; alt: string; caption?: string }) {
  return <figure className={styles.figure}><div className={styles.image}><Image unoptimized fill sizes="(max-width: 640px) 100vw, 600px" src={url} alt={alt} className="object-cover" /></div>{caption && <figcaption>{caption}</figcaption>}</figure>;
}
function content(block: PublicEventBlock): ReactNode {
  switch (block.type) {
    case 'heading': return block.text ? <h2>{block.text}</h2> : null;
    case 'paragraph': return block.text ? <p>{block.text}</p> : null;
    case 'image': return block.url ? <Photo {...block} /> : null;
    case 'callout': return block.title || block.text ? <aside className={styles.callout}>{block.title && <h3>{block.title}</h3>}{block.text && <p>{block.text}</p>}</aside> : null;
    case 'schedule': return <div className={styles.schedule}><span className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={16} />{block.time}</span><div><h3>{block.title}</h3><p>{block.description}</p></div></div>;
    case 'button': return block.label && safePublicLink(block.url) ? <a href={block.url} className={styles.button}>{block.label}</a> : null;
    case 'gallery': return block.images.length ? <div className={styles.gallery} style={{ '--gallery-columns': block.columns } as CSSProperties}>{block.images.filter((i) => i.url).map((image, index) => <Photo key={image.url + '-' + index} {...image} />)}</div> : null;
    case 'split': {
      const photo = block.url ? <Photo url={block.url} alt={block.alt} /> : null;
      const text = <div><h3>{block.title}</h3><p>{block.text}</p></div>;
      return <div className={block.url ? styles.split : undefined}>{block.imageSide === 'left' ? <>{photo}{text}</> : <>{text}{photo}</>}</div>;
    }
    case 'faq': return <div className={styles.faq}>{block.items.filter((item) => item.question).map((item, index) => <details key={index}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>;
    case 'list': { const Tag = block.ordered ? 'ol' : 'ul'; return <Tag className={styles.list + ' ' + (block.ordered ? styles.ordered : styles.bullets)}>{block.items.filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</Tag>; }
    case 'video': { const url = videoEmbedUrl(block.url); return url ? <figure className={styles.figure}><div className={styles.video}><iframe src={url} title={block.caption || 'Institution video'} loading="lazy" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>{block.caption && <figcaption>{block.caption}</figcaption>}</figure> : null; }
    case 'divider': return <hr className={styles.divider} />;
    case 'spacer': return <div aria-hidden="true" style={{ height: block.height }} />;
  }
}
export function EventContentBlocks({ blocks }: { blocks: PublicEventBlock[] }) {
  return <div className={styles.blocks}>{blocks.map((block) => {
    const body = content(block);
    if (!body) return null;
    return <div key={block.id} className={[styles.block, styles[block.style?.tone || 'plain'] || '', styles[block.style?.spacing || 'normal'] || ''].join(' ')} style={{ '--block-align': block.style?.align || 'left' } as CSSProperties}>{body}</div>;
  })}</div>;
}
