'use client';

import { useId, useRef } from 'react';
import { PUBLIC_SITE_THEMES, type PublicSiteThemeId } from '@/lib/public-site-themes';
import styles from './PublicWebsiteThemePicker.module.css';

export function PublicWebsiteThemePicker({ value, onChange }: { value: PublicSiteThemeId; onChange: (value: PublicSiteThemeId) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const trackId = useId();
  function scroll(direction: number) {
    const element = track.current;
    if (!element) return;
    element.scrollBy({ left: direction * Math.max(180, element.clientWidth * .75), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  return <fieldset className={styles.picker}>
    <legend>Website theme</legend>
    <p className={styles.help}>Choose a design, then apply the theme. All themes share your content and photos. Visitors see the new design on their next refresh.</p>
    <div className={styles.carousel}>
      <button type="button" className={styles.control} aria-label="Previous themes" aria-controls={trackId} onClick={() => scroll(-1)}>&lsaquo;</button>
      <div id={trackId} ref={track} className={styles.options}>
        {PUBLIC_SITE_THEMES.map((theme) => <label key={theme.id} className={styles.option + (value === theme.id ? ' ' + styles.selected : '')}>
          <input type="radio" name="theme" value={theme.id} checked={value === theme.id} onFocus={(event) => event.currentTarget.closest('label')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })} onChange={() => onChange(theme.id)} />
          <strong>{theme.name}</strong>
        </label>)}
      </div>
      <button type="button" className={styles.control} aria-label="Next themes" aria-controls={trackId} onClick={() => scroll(1)}>&rsaquo;</button>
    </div>
  </fieldset>;
}
