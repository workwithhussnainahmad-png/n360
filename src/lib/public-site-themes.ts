export const PUBLIC_SITE_THEMES = [
  { id: 'default', name: 'Default', accent: '#233c32', paper: '#ffffff', ink: '#183d32', layout: 'institution' },
  // Stable IDs keep existing institution selections valid; only the designs change.
  { id: 'heritage', name: 'Business', accent: '#7c2d12', paper: '#ffffff', ink: '#242421', layout: 'business' },
  { id: 'folio', name: 'School', accent: '#1d4ed8', paper: '#fffdf6', ink: '#20355b', layout: 'school' },
  { id: 'grove', name: 'College', accent: '#7c2d12', paper: '#faf8f3', ink: '#452735', layout: 'college' },
  { id: 'orbit', name: 'Professional', accent: '#233c32', paper: '#ffffff', ink: '#20251f', layout: 'professional' },
  { id: 'mosaic', name: 'Creative Mosaic', accent: '#7c2d12', paper: '#ffffff', ink: '#392c48', layout: 'collage' },
] as const;

export type PublicSiteThemeId = (typeof PUBLIC_SITE_THEMES)[number]['id'];
export const PUBLIC_SITE_THEME_IDS = ['default', 'heritage', 'folio', 'grove', 'orbit', 'mosaic'] as const;
export const DEFAULT_PUBLIC_SITE_THEME: PublicSiteThemeId = 'default';

export function getPublicSiteTheme(value: unknown) {
  return PUBLIC_SITE_THEMES.find((theme) => theme.id === value) || PUBLIC_SITE_THEMES[0];
}
