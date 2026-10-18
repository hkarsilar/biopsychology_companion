/** Helpers for crisp, theme-aware canvas drawing. */

export interface CanvasSize {
  w: number;
  h: number;
  dpr: number;
}

/** Resize a canvas's backing store to its CSS size × device pixel ratio. Returns the CSS size. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): CanvasSize {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr };
}

/** Read a CSS custom property (e.g. '--ion-na') as seen from an element. */
export function cssVar(el: Element, name: string, fallback = '#888'): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/** Read a whole palette of CSS variables at once. */
export function readPalette<T extends Record<string, string>>(el: Element, names: T): { [K in keyof T]: string } {
  const style = getComputedStyle(el);
  const out = {} as { [K in keyof T]: string };
  for (const key of Object.keys(names) as (keyof T)[]) {
    out[key] = style.getPropertyValue(names[key]).trim() || '#888';
  }
  return out;
}

export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : c;
    const n = parseInt(hex.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => parseFloat(x));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Ion glyphs: the shape is part of the colour language, so colour is never the only cue. */
export function drawIon(
  ctx: CanvasRenderingContext2D,
  kind: 'na' | 'k' | 'cl' | 'ca',
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (kind === 'na') {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (kind === 'k') {
    ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8);
  } else if (kind === 'cl') {
    ctx.moveTo(x, y - r * 1.1);
    ctx.lineTo(x + r * 1.05, y + r * 0.8);
    ctx.lineTo(x - r * 1.05, y + r * 0.8);
    ctx.closePath();
  } else {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.15, y);
    ctx.lineTo(x, y + r * 1.15);
    ctx.lineTo(x - r * 1.15, y);
    ctx.closePath();
  }
  ctx.fill();
}

/** Deterministic pseudo-random numbers, so the same scene draws the same way every time. */
export function rng(seed = 1): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
