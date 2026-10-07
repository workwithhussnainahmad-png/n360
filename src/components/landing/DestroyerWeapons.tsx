type Shape = { d: string; fill: string; stroke?: string };
const art: Shape[][] = [
  [
    {d:"M28 16 L36 18 L28 55 Q26 59 21 56 L19 54 Z",fill:"#b87538",stroke:"#342920"},
    {d:"M21 45 L29 48 L27 55 L20 53 Z",fill:"#e3ac66"},
    {d:"M10 6 L47 6 L50 11 L50 23 L10 23 L7 19 L7 10 Z",fill:"#b6c4cf",stroke:"#26343f"},
    {d:"M12 8 L46 8 L46 12 L12 12 Z",fill:"#eff7ff"},
    {d:"M8 14 L17 14 L17 23 L10 23 L7 19 Z",fill:"#728896"},
    {d:"M30 7 L36 7 L36 23 L30 23 Z",fill:"#526774"},
    {d:"M12 21 L46 21",fill:"none",stroke:"#617480"},
    {d:"M25 27 L30 28 M24 33 L28 34 M22 39 L26 40",fill:"none",stroke:"#e5b376"},
  ],
  [
    {d:"M9 16 L44 16 L49 20 L57 20 L57 30 L45 30 L39 34 L11 34 L6 28 Z",fill:"#354655",stroke:"#12212b"},
    {d:"M14 33 L29 33 L23 52 L13 52 L10 48 Z",fill:"#26343f",stroke:"#101b22"},
    {d:"M30 34 L38 34 L34 42 L25 42",fill:"none",stroke:"#758997"},
    {d:"M12 18 L35 18 L35 24 L12 24 Z",fill:"#92f6e6"},
    {d:"M41 20 L57 20 L57 30 L41 30 Z",fill:"#748995"},
    {d:"M53 21 L59 21 L59 29 L53 29 Z",fill:"#5effd4",stroke:"#173e36"},
    {d:"M19 12 L28 12 L28 16 L19 16 Z",fill:"#dfb06e"},
    {d:"M14 37 L24 37 M13 42 L23 42 M13 47 L21 47",fill:"none",stroke:"#546575"},
    {d:"M42 23 L51 23",fill:"none",stroke:"#d5e1e8"},
  ],
  [
    {d:"M3 32 L20 28 L25 37 L10 50 L3 47 Z",fill:"#9c6538",stroke:"#362719"},
    {d:"M18 26 L55 20 L59 22 L59 29 L23 36 Z",fill:"#697b89",stroke:"#17252f"},
    {d:"M23 26 L58 20 L58 23 L23 29 Z",fill:"#c2d0dc"},
    {d:"M31 30 L48 27 L49 34 L32 37 Z",fill:"#b47b44",stroke:"#402a1c"},
    {d:"M26 35 L35 34 L33 43 L25 43 Z",fill:"none",stroke:"#293b45"},
    {d:"M54 20 L60 20 L60 29 L54 30 Z",fill:"#28343c"},
    {d:"M10 35 L17 33",fill:"none",stroke:"#dab27d"},
    {d:"M35 30 L36 35 M40 29 L41 34 M45 28 L46 33",fill:"none",stroke:"#5b3922"},
    {d:"M25 29 L52 24",fill:"none",stroke:"#a2b4c2"},
  ],
  [
    {d:"M29 18 C26 7 38 5 42 10",fill:"none",stroke:"#b37b3c"},
    {d:"M25 17 L37 17 L39 24 L23 24 Z",fill:"#697989",stroke:"#19262e"},
    {d:"M31 22 C8 22 8 55 31 56 C54 55 54 22 31 22 Z",fill:"#26343f",stroke:"#101b22"},
    {d:"M23 29 Q16 32 18 40",fill:"none",stroke:"#a7c1d1"},
    {d:"M21 46 Q31 54 42 45",fill:"none",stroke:"#425560"},
    {d:"M42 5 L43 11 L50 10 L45 15 L49 20 L42 16 L37 20 L39 13 L35 9 L41 10 Z",fill:"#ffb24b"},
    {d:"M28 26 Q39 25 45 35",fill:"none",stroke:"#627683"},
  ],
];
const paths = new Map<number, {path: Path2D; shape: Shape}[]>();

export function WeaponGraphic({weapon, size = 46}: {weapon: number; size?: number}) {
  return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" data-weapon-art={weapon}>
    {art[weapon].map((shape,index)=><path key={index} d={shape.d} fill={shape.fill} stroke={shape.stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
  </svg>;
}

export function drawWeapon(ctx: CanvasRenderingContext2D, weapon: number, x: number, y: number, recoil = 0) {
  let cached = paths.get(weapon);
  if (!cached) { cached = art[weapon].map(shape=>({shape,path:new Path2D(shape.d)})); paths.set(weapon,cached); }
  ctx.save(); ctx.translate(x,y);
  if (weapon === 0) { ctx.rotate(-.2 - recoil * .65); ctx.scale(.7,.7); ctx.translate(-30,-16); }
  else if (weapon === 3) { ctx.scale(.65,.65); ctx.translate(-31,-35); }
  else { ctx.rotate(-recoil * .08); ctx.translate(-recoil * 5, recoil * 2); ctx.scale(.8,.8); ctx.translate(-59,-24); }
  ctx.lineWidth = 2; ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const {shape,path} of cached) {
    if (shape.fill !== "none") { ctx.fillStyle=shape.fill;ctx.fill(path); }
    if (shape.stroke) { ctx.strokeStyle=shape.stroke;ctx.stroke(path); }
  }
  ctx.restore();
}
