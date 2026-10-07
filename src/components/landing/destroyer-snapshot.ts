// Bounded local canvas sketch. No DOM clones, network requests or HTML rasterizer.
export function snapshotPiece(element: HTMLElement, bounds: DOMRect) {
  const image = document.createElement("canvas");
  const scale = Math.min(1, 1600 / bounds.width, 900 / bounds.height);
  image.width = Math.max(1, Math.ceil(bounds.width * scale));
  image.height = Math.max(1, Math.ceil(bounds.height * scale));
  const ctx = image.getContext("2d");
  if (!ctx) return image;
  ctx.scale(scale, scale);
  const nodes = [element, ...Array.from(element.querySelectorAll<HTMLElement>("*")).slice(0, 140)];
  const styles = new Map<Element, CSSStyleDeclaration>();
  for (const node of nodes) {
    const style = getComputedStyle(node); styles.set(node, style);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const r = node.getBoundingClientRect(), x = r.left - bounds.left, y = r.top - bounds.top;
    if (!r.width || !r.height || x > bounds.width || y > bounds.height || x + r.width < 0 || y + r.height < 0) continue;
    ctx.fillStyle = style.backgroundColor; ctx.fillRect(x, y, r.width, r.height);
    if (parseFloat(style.borderTopWidth)) {
      ctx.strokeStyle = style.borderTopColor; ctx.lineWidth = parseFloat(style.borderTopWidth); ctx.strokeRect(x, y, r.width, r.height);
    }
    if ((node instanceof HTMLImageElement && node.complete && node.naturalWidth) || node instanceof HTMLCanvasElement) {
      try { ctx.drawImage(node, x, y, r.width, r.height); } catch { /* Lost WebGL contexts use colored debris. */ }
    }
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), range = document.createRange();
  let words = 0, text: Node | null;
  ctx.textBaseline = "top";
  while ((text = walker.nextNode()) && words < 220) {
    const style = text.parentElement && styles.get(text.parentElement);
    if (!style || style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`; ctx.fillStyle = style.color;
    for (const word of (text.textContent ?? "").matchAll(/\S+/g)) {
      if (++words > 220) break;
      range.setStart(text, word.index!); range.setEnd(text, word.index! + word[0].length);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      ctx.fillText(style.textTransform === "uppercase" ? word[0].toUpperCase() : word[0], r.left - bounds.left, r.top - bounds.top + Math.max(0, (r.height - parseFloat(style.fontSize)) / 2));
    }
  }
  return image;
}
