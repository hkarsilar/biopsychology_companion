/**
 * Lateral inhibition, modelled as a Hartline–Ratliff network.
 *
 * Every receptor is excited by its own light, e_i, and inhibited by the firing of its neighbours:
 *
 *   r_i = max(0, e_i − Σ_j K_ij · r_j)        (recurrent: cells inhibit each other)
 *   r_i = max(0, e_i − Σ_j K_ij · e_j)        (feed-forward: inhibition comes from the light itself)
 *
 * K_ij = strength · w(|i − j|), where w is a Gaussian of width `spread` (in receptor spacings),
 * with no self-inhibition and normalised so the weights sum to 1. A uniform field therefore
 * settles to e / (1 + strength): flat, just lower. Only changes in the light stand out.
 *
 * Units: light and firing are both on a 0–1 scale here; the element shows 1 as 100 spikes/s.
 * The ends of the strip (and the edges of the picture) are mirrored, so they never look like edges.
 *
 * This file has no DOM code, so it runs in tests and in the browser alike.
 */

export const MIN_SPREAD = 0.8;
export const MAX_SPREAD = 8;
export const MAX_STRENGTH = 0.9;
/** How far each animated settling round moves towards its target (a leaky integrator). */
export const SETTLE_RATE = 0.3;

export interface NetParams {
  /** Total inhibitory weight a cell receives from all its neighbours, 0–0.9 */
  strength: number;
  /** Width of the inhibitory surround, in receptor spacings */
  spread: number;
  /** true: inhibition driven by the light (no loops); false: by neighbours' firing (Hartline–Ratliff) */
  feedforward?: boolean;
}

export const defaultNet: NetParams = { strength: 0.6, spread: 2.5, feedforward: false };

export function clampParams(p: NetParams): NetParams {
  return {
    strength: Math.min(MAX_STRENGTH, Math.max(0, p.strength)),
    spread: Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, p.spread)),
    feedforward: !!p.feedforward,
  };
}

/** Mirror an index into 0…n−1 (the edge sample repeats: …2 1 0 | 0 1 2 …). */
export function reflect(j: number, n: number): number {
  const p = 2 * n;
  const k = ((j % p) + p) % p;
  return k < n ? k : p - 1 - k;
}

// ---------------------------------------------------------------------------
// The strip: one row of receptors
// ---------------------------------------------------------------------------

export interface Taps {
  offsets: number[];
  weights: number[];
}

/** The inhibitory surround: Gaussian weights at offsets ±1…±3σ, no self term, summing to 1. */
export function surround(spread: number): Taps {
  const s = Math.max(MIN_SPREAD, spread);
  const R = Math.max(1, Math.ceil(3 * s));
  const offsets: number[] = [];
  const weights: number[] = [];
  let sum = 0;
  for (let d = 1; d <= R; d++) {
    const w = Math.exp(-(d * d) / (2 * s * s));
    offsets.push(-d, d);
    weights.push(w, w);
    sum += 2 * w;
  }
  for (let i = 0; i < weights.length; i++) weights[i] /= sum;
  return { offsets, weights };
}

/** Weight of the connection from a cell `d` places away (0 for itself). */
export function weightAt(d: number, p: NetParams): number {
  if (d === 0) return 0;
  const t = surround(p.spread);
  const i = t.offsets.indexOf(d);
  return i < 0 ? 0 : p.strength * t.weights[i];
}

/** The inhibition each cell receives, given the activity that drives it. */
export function inhibition(drive: ArrayLike<number>, p: NetParams, taps = surround(p.spread)): Float64Array {
  const n = drive.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = 0; k < taps.offsets.length; k++) acc += taps.weights[k] * drive[reflect(i + taps.offsets[k], n)];
    out[i] = p.strength * acc;
  }
  return out;
}

/** What each cell is pulled towards, given the current firing `r`. */
export function target(e: ArrayLike<number>, r: ArrayLike<number>, p: NetParams, taps = surround(p.spread)): Float64Array {
  const inh = inhibition(p.feedforward ? e : r, p, taps);
  const out = new Float64Array(e.length);
  for (let i = 0; i < e.length; i++) out[i] = Math.max(0, e[i] - inh[i]);
  return out;
}

/** One round of settling: each cell moves a fraction `rate` of the way to its target. */
export function round(
  e: ArrayLike<number>,
  r: ArrayLike<number>,
  p: NetParams,
  rate = SETTLE_RATE,
  taps = surround(p.spread),
): Float64Array {
  const t = target(e, r, p, taps);
  const out = new Float64Array(e.length);
  for (let i = 0; i < e.length; i++) out[i] = (1 - rate) * r[i] + rate * t[i];
  return out;
}

export interface SettleOptions {
  rate?: number;
  /** Stop when no cell changes by more than this in one round */
  tol?: number;
  maxRounds?: number;
  /** Starting firing; defaults to all zero (the light has just come on) */
  start?: ArrayLike<number>;
}

export interface Settling {
  /** rounds[0] is the starting state; the last entry is the settled (or last computed) state */
  rounds: Float64Array[];
  converged: boolean;
}

/** Every round of the network settling, for animation. */
export function settle(e: ArrayLike<number>, p: NetParams, opts: SettleOptions = {}): Settling {
  const { rate = SETTLE_RATE, tol = 0.0015, maxRounds = 120 } = opts;
  const taps = surround(p.spread);
  let r: Float64Array = opts.start ? Float64Array.from(opts.start) : new Float64Array(e.length);
  const rounds: Float64Array[] = [r];
  for (let k = 0; k < maxRounds; k++) {
    const next = round(e, r, p, rate, taps);
    let change = 0;
    for (let i = 0; i < r.length; i++) change = Math.max(change, Math.abs(next[i] - r[i]));
    rounds.push(next);
    r = next;
    if (change < tol && k > 1) return { rounds, converged: true };
  }
  return { rounds, converged: false };
}

/**
 * The settled firing pattern, solved quickly. The step size is chosen so that both the smoothest
 * pattern (uniform light) and the most jagged one (alternating cells) shrink fast.
 */
export function steady(e: ArrayLike<number>, p: NetParams, opts: { tol?: number; maxRounds?: number; start?: ArrayLike<number> } = {}): Float64Array {
  const taps = surround(p.spread);
  if (p.feedforward) return target(e, e, p, taps);
  const { tol = 1e-7, maxRounds = 400 } = opts;
  const rate = 2 / (2 + 0.15 * p.strength);
  let r: Float64Array = opts.start ? Float64Array.from(opts.start) : Float64Array.from(e);
  for (let k = 0; k < maxRounds; k++) {
    const next = round(e, r, p, rate, taps);
    let change = 0;
    for (let i = 0; i < r.length; i++) change = Math.max(change, Math.abs(next[i] - r[i]));
    r = next;
    if (change < tol) break;
  }
  return r;
}

/** Firing for a large uniform field: what the display maps back to the original brightness. */
export function uniformGain(p: NetParams): number {
  return p.feedforward ? 1 - p.strength : 1 / (1 + p.strength);
}

// ---------------------------------------------------------------------------
// Light patterns for the strip
// ---------------------------------------------------------------------------

export const STRIP_N = 60;
export type StripPattern = 'edge' | 'staircase' | 'bar' | 'mach' | 'uniform' | 'draw';

export const DIM = 0.25;
export const BRIGHT = 0.75;

/** Where a Mach ramp starts and ends: a short ramp, so the bands at its knees are clear. */
export function rampKnees(n: number): { a: number; b: number } {
  const width = Math.round(n / 5);
  const a = Math.round((n - width) / 2);
  return { a, b: a + width };
}

export function stripPattern(name: StripPattern, n = STRIP_N): Float64Array {
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n;
    switch (name) {
      case 'edge':
        e[i] = i < n / 2 ? DIM : BRIGHT;
        break;
      case 'staircase': {
        const steps = 5;
        const k = Math.min(steps - 1, Math.floor(x * steps));
        e[i] = 0.12 + (k * (0.88 - 0.12)) / (steps - 1);
        break;
      }
      case 'bar':
        e[i] = Math.abs(i - (n - 1) / 2) < n / 14 ? BRIGHT : DIM;
        break;
      case 'mach': {
        const { a, b } = rampKnees(n);
        e[i] = i < a ? DIM : i >= b ? BRIGHT : DIM + ((i - a + 0.5) / (b - a)) * (BRIGHT - DIM);
        break;
      }
      case 'uniform':
        e[i] = 0.6;
        break;
      case 'draw':
        // A soft hill to start drawing from.
        e[i] = 0.3 + 0.35 * Math.exp(-((x - 0.5) ** 2) / 0.02);
        break;
    }
  }
  return e;
}

/** Pack a light profile into a short URL-safe string: one character (0–9, a–v) per receptor. */
export function encodeProfile(e: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < e.length; i++) s += Math.round(Math.min(1, Math.max(0, e[i])) * 31).toString(32);
  return s;
}

export function decodeProfile(s: string, n = STRIP_N): Float64Array | null {
  if (!/^[0-9a-v]+$/i.test(s) || s.length !== n) return null;
  return Float64Array.from(s.toLowerCase(), (c) => parseInt(c, 32) / 31);
}

// ---------------------------------------------------------------------------
// The picture: a sheet of receptors
// ---------------------------------------------------------------------------

export const IMG_W = 128;
export const IMG_H = 96;

export interface Picture {
  w: number;
  h: number;
  data: Float32Array;
}

export type ImagePattern = 'hermann' | 'contrast' | 'mach' | 'staircase';

/** The Hermann grid: dark blocks, light streets. Centred so a crossing sits in the middle. */
export const HERMANN = { block: 15, street: 7, cx: 64, cy: 48 };

export function hermannPeriod(): number {
  return HERMANN.block + HERMANN.street;
}

/** Is pixel `i` (along one axis) in a street? Blocks cut off by the picture's edge count as street, giving a light margin. */
function inStreet(i: number, c: number, n: number): boolean {
  const P = hermannPeriod();
  const d = (((i - c) % P) + P) % P;
  const half = (HERMANN.street - 1) / 2;
  if (d <= half || d >= P - half) return true;
  const start = i - d + half + 1;
  return start < 0 || start + HERMANN.block > n;
}

/** Crossings and street midpoints of the Hermann grid that lie well inside the picture. */
export function hermannPoints(w = IMG_W, h = IMG_H): { crossings: { x: number; y: number }[]; midpoints: { x: number; y: number }[] } {
  const P = hermannPeriod();
  const crossings: { x: number; y: number }[] = [];
  const midpoints: { x: number; y: number }[] = [];
  for (let x = HERMANN.cx - 3 * P; x < w; x += P) {
    for (let y = HERMANN.cy - 3 * P; y < h; y += P) {
      if (x >= 0 && y >= 0 && x < w && y < h) crossings.push({ x, y });
      const mx = x + P / 2;
      if (mx >= 0 && mx < w && y >= 0 && y < h) midpoints.push({ x: Math.round(mx), y });
    }
  }
  return { crossings, midpoints };
}

/** The two grey squares of the simultaneous-contrast picture: same grey, different surround. */
export const CONTRAST = { side: 12, grey: 0.5, dark: 0.15, light: 0.85 };

export function contrastSquares(w = IMG_W, h = IMG_H): { onDark: { x: number; y: number }; onLight: { x: number; y: number } } {
  return { onDark: { x: Math.round(w / 4), y: Math.round(h / 2) }, onLight: { x: Math.round((3 * w) / 4), y: Math.round(h / 2) } };
}

export function imagePattern(name: ImagePattern, w = IMG_W, h = IMG_H): Picture {
  const data = new Float32Array(w * h);
  const sq = contrastSquares(w, h);
  const halfSide = CONTRAST.side / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      switch (name) {
        case 'hermann':
          v = inStreet(x, HERMANN.cx, w) || inStreet(y, HERMANN.cy, h) ? 0.85 : 0.12;
          break;
        case 'contrast': {
          v = x < w / 2 ? CONTRAST.dark : CONTRAST.light;
          for (const c of [sq.onDark, sq.onLight]) {
            if (Math.abs(x + 0.5 - c.x) <= halfSide && Math.abs(y + 0.5 - c.y) <= halfSide) v = CONTRAST.grey;
          }
          break;
        }
        case 'mach': {
          const { a, b } = rampKnees(w);
          v = x < a ? DIM : x >= b ? BRIGHT : DIM + ((x - a + 0.5) / (b - a)) * (BRIGHT - DIM);
          break;
        }
        case 'staircase': {
          const k = Math.min(4, Math.floor(((x + 0.5) / w) * 5));
          v = 0.12 + (k * 0.76) / 4;
          break;
        }
      }
      data[y * w + x] = v;
    }
  }
  return { w, h, data };
}

export interface Gaze {
  x: number;
  y: number;
}

/**
 * How wide the surround is at each point. Without a gaze point it is the same everywhere.
 * With one, receptive fields are small where you look (the fovea) and grow towards the periphery.
 */
export function spreadAt(x: number, y: number, spread: number, gaze: Gaze | null, w = IMG_W): number {
  if (!gaze) return spread;
  const fovea = Math.max(MIN_SPREAD, 0.22 * spread);
  const ecc = Math.hypot(x - gaze.x, y - gaze.y);
  const reach = 0.3 * w;
  const t = Math.min(1, ecc / reach);
  return fovea + (spread - fovea) * t;
}

/**
 * A sheet of receptors with a (possibly position-dependent) Gaussian surround.
 * The surround is applied as two 1D passes, which is exact when the width is uniform and a close,
 * smooth approximation when the width varies slowly with eccentricity.
 */
export class Sheet {
  readonly w: number;
  readonly h: number;
  private level = new Uint8Array(0);
  private kernels: Float32Array[] = [];
  private radii: number[] = [];
  private centre: number[] = [];
  private tmp: Float32Array;
  private pad: Float32Array;
  private padR = 0;
  /** The surround width used at each pixel (for drawing receptive fields) */
  widths: Float32Array;

  constructor(w = IMG_W, h = IMG_H) {
    this.w = w;
    this.h = h;
    this.tmp = new Float32Array(w * h);
    this.widths = new Float32Array(w * h);
    this.pad = new Float32Array(0);
  }

  /** Set the surround width everywhere, or around a gaze point. */
  configure(spread: number, gaze: Gaze | null = null): void {
    const { w, h } = this;
    const step = 0.1;
    const levels = new Map<number, number>();
    this.kernels = [];
    this.radii = [];
    this.centre = [];
    this.level = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = Math.max(MIN_SPREAD, spreadAt(x, y, spread, gaze, w));
        const q = Math.round(s / step);
        let li = levels.get(q);
        if (li === undefined) {
          li = this.kernels.length;
          levels.set(q, li);
          const sigma = q * step;
          const R = Math.max(1, Math.ceil(3 * sigma));
          const k = new Float32Array(2 * R + 1);
          let sum = 0;
          for (let d = -R; d <= R; d++) {
            const v = Math.exp(-(d * d) / (2 * sigma * sigma));
            k[d + R] = v;
            sum += v;
          }
          for (let i = 0; i < k.length; i++) k[i] /= sum;
          this.kernels.push(k);
          this.radii.push(R);
          this.centre.push(k[R] * k[R]);
        }
        this.level[y * w + x] = li;
        this.widths[y * w + x] = q * step;
      }
    }
    this.padR = Math.max(...this.radii);
    this.pad = new Float32Array(Math.max(w, h) + 2 * this.padR);
  }

  /** Inhibition at each pixel from `drive`, scaled by `strength`. */
  inhibition(drive: Float32Array, strength: number, out: Float32Array = new Float32Array(this.w * this.h)): Float32Array {
    const { w, h, tmp, pad, padR, level, kernels, radii, centre } = this;
    // Horizontal pass
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = -padR; x < w + padR; x++) pad[x + padR] = drive[row + reflect(x, w)];
      for (let x = 0; x < w; x++) {
        const li = level[row + x];
        const k = kernels[li];
        const R = radii[li];
        let acc = 0;
        const base = x + padR - R;
        for (let d = 0; d < k.length; d++) acc += k[d] * pad[base + d];
        tmp[row + x] = acc;
      }
    }
    // Vertical pass, then remove the cell's own contribution and renormalise
    for (let x = 0; x < w; x++) {
      for (let y = -padR; y < h + padR; y++) pad[y + padR] = tmp[reflect(y, h) * w + x];
      for (let y = 0; y < h; y++) {
        const i = y * w + x;
        const li = level[i];
        const k = kernels[li];
        const R = radii[li];
        let acc = 0;
        const base = y + padR - R;
        for (let d = 0; d < k.length; d++) acc += k[d] * pad[base + d];
        const c = centre[li];
        out[i] = (strength * (acc - c * drive[i])) / (1 - c);
      }
    }
    return out;
  }

  /** One round of settling from `r` towards the network's target. Returns the largest change. */
  round(e: Float32Array, r: Float32Array, p: NetParams, rate = SETTLE_RATE, out: Float32Array = new Float32Array(this.w * this.h)): number {
    const inh = this.inhibition(p.feedforward ? e : r, p.strength);
    let change = 0;
    for (let i = 0; i < r.length; i++) {
      const t = Math.max(0, e[i] - inh[i]);
      const v = (1 - rate) * r[i] + rate * t;
      change = Math.max(change, Math.abs(v - r[i]));
      out[i] = v;
    }
    return change;
  }

  /** Settle fully (or until `maxRounds`), optionally starting from a previous answer. */
  steady(e: Float32Array, p: NetParams, opts: { start?: Float32Array; tol?: number; maxRounds?: number } = {}): Float32Array {
    const { tol = 1e-4, maxRounds = 80 } = opts;
    if (p.feedforward) {
      const out = new Float32Array(e.length);
      const inh = this.inhibition(e, p.strength);
      for (let i = 0; i < e.length; i++) out[i] = Math.max(0, e[i] - inh[i]);
      return out;
    }
    const rate = 2 / (2 + 0.6 * p.strength);
    let r: Float32Array = opts.start ? Float32Array.from(opts.start) : Float32Array.from(e);
    let next: Float32Array = new Float32Array(e.length);
    for (let k = 0; k < maxRounds; k++) {
      const change = this.round(e, r, p, rate, next);
      [r, next] = [next, r];
      if (change < tol) break;
    }
    return r;
  }
}

/** Mean of a square patch of pixels centred on (cx, cy). */
export function patchMean(img: Float32Array, w: number, cx: number, cy: number, half: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.round(cy - half); y <= Math.round(cy + half); y++) {
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      sum += img[y * w + x];
      n++;
    }
  }
  return sum / n;
}
