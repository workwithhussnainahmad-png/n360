import type { PublicSiteThemeId } from '@/lib/public-site-themes';

/** Decorative learning motifs. Never presented as a photograph of the campus. */
export function ThemeArtwork({ theme }: { theme: PublicSiteThemeId }) {
  return <svg viewBox="0 0 640 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" fill="none">
    {theme === 'heritage' && <>
      <path fill="#ded1bc" d="M0 0h640v640H0z" /><path d="M42 42h556v556H42z" stroke="#7c2d12" strokeOpacity=".4" />
      <circle cx="320" cy="270" r="169" stroke="#7c2d12" strokeWidth="2" /><circle cx="320" cy="270" r="151" stroke="#7c2d12" strokeOpacity=".35" />
      <path d="M175 223c55-17 97-11 145 23 48-34 90-40 145-23v131c-55-17-97-11-145 23-48-34-90-40-145-23V223Z" fill="#f7f1e7" stroke="#7c2d12" strokeWidth="3" />
      <path d="M320 246v131m-123-128c34-4 65 2 102 23m-102-1c34-4 65 2 102 23m-102-1c34-4 65 2 102 23m44-44c37-21 68-27 102-23m-102 45c37-21 68-27 102-23m-102 45c37-21 68-27 102-23" stroke="#7c2d12" strokeOpacity=".5" strokeWidth="2" />
      <path d="m320 151 8 15 17 3-13 12 3 18-15-8-15 8 3-18-13-12 17-3 8-15Z" fill="#7c2d12" /><path d="M202 458h236M250 478h140" stroke="#7c2d12" strokeWidth="2" />
    </>}
    {theme === 'folio' && <>
      <path fill="#c8cebb" d="M0 0h640v640H0z" /><circle cx="390" cy="270" r="204" fill="#e5ed78" />
      <g stroke="#233c32" strokeWidth="3"><path d="M83 113v412h475M123 153v332h395M163 193v252h315M203 233v172h235M243 273v92h155" /><path d="m82 525 200-200 110 83 163-254" /></g>
      <circle cx="282" cy="325" r="13" fill="#233c32" /><circle cx="392" cy="408" r="13" fill="#233c32" /><path d="m482 149 72 4 3 71" stroke="#233c32" strokeWidth="10" />
    </>}
    {theme === 'grove' && <>
      <path fill="#c1d6c3" d="M0 0h640v640H0z" /><circle cx="430" cy="195" r="104" fill="#f0f5ed" />
      <path d="M320 540V180m0 180-98-95m98 162 104-104m-104-6 84-80" stroke="#183d32" strokeWidth="6" />
      <path d="M320 230c-80-80-50-145 0-180 50 35 80 100 0 180Z" fill="#0f766e" /><path d="M285 321c-120 0-163-70-150-143 87-7 161 51 150 143Z" fill="#648b69" /><path d="M355 354c-1-121 80-167 155-150 2 86-58 159-155 150Z" fill="#0f766e" /><path d="M278 446c-131 2-181-76-171-157 91-12 175 58 171 157Z" fill="#8aac83" /><path d="M359 463c-9-102 63-162 147-149 9 83-52 160-147 149Z" fill="#648b69" />
      <path d="M190 546h259" stroke="#183d32" strokeWidth="4" />
    </>}
    {theme === 'orbit' && <>
      <path fill="#102b4f" d="M0 0h640v640H0z" />
      <g stroke="#aac7ed" strokeOpacity=".13"><path d="M0 80h640M0 160h640M0 240h640M0 320h640M0 400h640M0 480h640M0 560h640M80 0v640M160 0v640M240 0v640M320 0v640M400 0v640M480 0v640M560 0v640" /><circle cx="320" cy="320" r="262" /></g>
      <circle cx="320" cy="320" r="131" fill="#709eeb" /><path d="M189 320a131 131 0 0 0 262 0" fill="#4274c6" />
      <ellipse cx="320" cy="320" rx="243" ry="76" transform="rotate(-35 320 320)" stroke="#efd090" strokeWidth="3" /><ellipse cx="320" cy="320" rx="222" ry="80" transform="rotate(47 320 320)" stroke="#a6cbff" strokeWidth="2" />
      <circle cx="139" cy="446" r="12" fill="#efd090" /><circle cx="448" cy="465" r="8" fill="#a6cbff" /><path d="M501 104v28m-14-14h28M110 159v16m-8-8h16" stroke="#efd090" strokeWidth="2" />
    </>}
    {theme === 'mosaic' && <>
      <path fill="#efad97" d="M0 0h640v640H0z" /><circle cx="470" cy="166" r="104" fill="#f9d76f" />
      <path d="M105 355 311 112l192 243H105Z" fill="#355bba" /><path d="M179 310h72v192h-72zM266 257h72v245h-72zM353 206h72v296h-72z" fill="#fff7ef" />
      <path d="m106 531 14-24 18 24 19-24 19 24 18-24 19 24 18-24 19 24" stroke="#392c48" strokeWidth="5" /><circle cx="115" cy="147" r="33" stroke="#392c48" strokeWidth="4" /><path d="M512 406v94m-47-47h94" stroke="#392c48" strokeWidth="5" />
    </>}
  </svg>;
}
