/**
 * The shape of the home-page neuron, worked out for any canvas size.
 *
 * Wide canvases get a horizontal cell (dendrites on the left, axon running right); narrow,
 * tall ones (phones) get the same cell stood upright (dendrites on top, axon running down).
 * Everything is built in a frame where u runs along the cell (dendrites → terminals) and
 * v runs across it, then mapped to screen pixels.
 */
import { rng } from '../shared/canvas';

export interface Pt {
  x: number;
  y: number;
}

export interface Polyline {
  pts: Pt[];
  /** Cumulative length along pts */
  cum: number[];
  len: number;
}

export interface Branch extends Polyline {
  /** Index of the parent branch, or −1 for a branch leaving the cell body */
  parent: number;
  depth: number;
  /** Full width at the start and end of the branch (px) */
  w0: number;
  w1: number;
}

export interface Label {
  text: string;
  x: number;
  y: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  leader?: [Pt, Pt];
}

export interface Site {
  branch: number;
  /** Distance along the branch (px) */
  s: number;
  at: Pt;
  /** Where the presynaptic terminal sits, just off the dendrite */
  marker: Pt;
  fiberEnd: Pt;
}

export interface NeuronGeometry {
  w: number;
  h: number;
  vertical: boolean;
  soma: Pt;
  R: number;
  somaOutline: Pt[];
  nucleus: Pt;
  dendrites: Branch[];
  /** Longest path from a dendrite tip to the cell body (px) */
  maxPath: number;
  hillock: Pt[];
  axon: Polyline;
  axonWidth: number;
  myelinWidth: number;
  /** Arc-length ranges of the myelin segments */
  myelin: [number, number][];
  /** Arc-length positions the spike visits: initial segment, each node of Ranvier, the end */
  jumps: number[];
  terminals: Branch[];
  boutons: Pt[];
  boutonR: number;
  inhib: { bouton: Pt; r: number; contact: Pt; fiber: Pt[] };
  /** Excitatory synapses drawn on the dendrites (used by the "Poke a dendrite" button) */
  sites: Site[];
  markerR: number;
  labels: Label[];
}

export type Hit =
  | { kind: 'dendrite'; branch: number; s: number; at: Pt }
  | { kind: 'inhib' }
  | { kind: 'soma' }
  | { kind: 'axon' }
  | null;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export function polyline(pts: Pt[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, len: cum[cum.length - 1] };
}

function locate(line: Polyline, s: number): { i: number; f: number } {
  const t = clamp(s, 0, line.len);
  let lo = 0;
  let hi = line.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (line.cum[mid] <= t) lo = mid;
    else hi = mid;
  }
  const seg = line.cum[hi] - line.cum[lo];
  return { i: lo, f: seg > 0 ? (t - line.cum[lo]) / seg : 0 };
}

export function pointAt(line: Polyline, s: number): Pt {
  const { i, f } = locate(line, s);
  const a = line.pts[i];
  const b = line.pts[Math.min(i + 1, line.pts.length - 1)];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/** Unit tangent at arc length s. */
export function tangentAt(line: Polyline, s: number): Pt {
  const { i } = locate(line, s);
  const a = line.pts[i];
  const b = line.pts[Math.min(i + 1, line.pts.length - 1)];
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/** The points of a line between two arc lengths (in either order). */
export function subPath(line: Polyline, s0: number, s1: number): Pt[] {
  const rev = s1 < s0;
  const a = Math.min(s0, s1);
  const b = Math.max(s0, s1);
  const out: Pt[] = [pointAt(line, a)];
  for (let i = 0; i < line.pts.length; i++) if (line.cum[i] > a && line.cum[i] < b) out.push(line.pts[i]);
  out.push(pointAt(line, b));
  return rev ? out.reverse() : out;
}

export function widthAt(b: Branch, s: number): number {
  return b.w0 + (b.w1 - b.w0) * clamp(s / (b.len || 1), 0, 1);
}

/** Path length from a point on a dendrite to the cell body. */
export function pathLength(g: NeuronGeometry, branch: number, s: number): number {
  let total = s;
  let p = g.dendrites[branch].parent;
  while (p >= 0) {
    total += g.dendrites[p].len;
    p = g.dendrites[p].parent;
  }
  return total;
}

/** The route a signal takes from a synapse on a dendrite to the middle of the cell body. */
export function pathToSoma(g: NeuronGeometry, branch: number, s: number): Polyline {
  const pts: Pt[] = [...subPath(g.dendrites[branch], s, 0)];
  let p = g.dendrites[branch].parent;
  while (p >= 0) {
    const b = g.dendrites[p];
    pts.push(...[...b.pts].reverse().slice(1));
    p = b.parent;
  }
  pts.push(g.soma);
  return polyline(pts);
}

function distToSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return { d: Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy), t };
}

/** What is under the pointer? `tol` is extra slack in px (bigger for touch). */
export function hitTest(g: NeuronGeometry, x: number, y: number, tol = 10): Hit {
  const p = { x, y };
  if (Math.hypot(x - g.inhib.bouton.x, y - g.inhib.bouton.y) <= Math.max(g.inhib.r + tol, 18)) return { kind: 'inhib' };
  let best: { branch: number; s: number; d: number } | null = null;
  g.dendrites.forEach((b, bi) => {
    for (let i = 0; i < b.pts.length - 1; i++) {
      const { d, t } = distToSegment(p, b.pts[i], b.pts[i + 1]);
      const s = b.cum[i] + t * (b.cum[i + 1] - b.cum[i]);
      const slack = widthAt(b, s) / 2 + tol;
      if (d <= slack && (!best || d - slack < best.d)) best = { branch: bi, s, d: d - slack };
    }
  });
  if (best) {
    const { branch, s } = best;
    return { kind: 'dendrite', branch, s, at: pointAt(g.dendrites[branch], s) };
  }
  if (Math.hypot(x - g.soma.x, y - g.soma.y) <= g.R * 1.1) return { kind: 'soma' };
  for (let i = 0; i < g.axon.pts.length - 1; i++) {
    if (distToSegment(p, g.axon.pts[i], g.axon.pts[i + 1]).d <= g.myelinWidth / 2 + tol) return { kind: 'axon' };
  }
  for (const b of g.terminals) {
    for (let i = 0; i < b.pts.length - 1; i++) if (distToSegment(p, b.pts[i], b.pts[i + 1]).d <= g.boutonR + tol / 2) return { kind: 'axon' };
  }
  return null;
}

/** Soma radius at angle θ (in the u, v frame): a slightly lumpy circle. */
function somaRadius(R: number, theta: number): number {
  return R * (1 + 0.05 * Math.sin(3 * theta + 0.7) + 0.035 * Math.sin(5 * theta + 2.1));
}

interface RawBranch {
  pts: Pt[];
  parent: number;
  depth: number;
  offset: Pt;
}

export function buildGeometry(w: number, h: number, measure: (text: string) => number = (t) => t.length * 6.4, fontPx = 12): NeuronGeometry {
  const vertical = w / h < 1.25;
  const L = vertical ? h : w;
  const B = vertical ? w : h;
  const map = (u: number, v: number): Pt => (vertical ? { x: w / 2 + v, y: u } : { x: u, y: h / 2 + v });
  const margin = Math.max(10, Math.min(w, h) * 0.035);
  const somaU = L * (vertical ? 0.36 : 0.27);
  const R = clamp(Math.min(L * (vertical ? 0.058 : 0.045), B * 0.1), 14, 46);
  const dir = (a: number): Pt => ({ x: Math.cos(a), y: Math.sin(a) });
  let rand = rng(1);

  // ---------- Dendrites, in unit lengths, then scaled to fit ----------
  const spread = vertical ? 1.2 : 1.25;
  const maxDev = 1.72;
  let raw: RawBranch[] = [];
  const quad = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
    x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
    y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
  });
  const grow = (start: Pt, angle: number, len: number, depth: number, parent: number, offset: Pt) => {
    // Deviation from "straight back", wrapped into (−π, π], then limited so no branch points at the axon.
    const dev = ((((angle - Math.PI + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
    const a = Math.PI + clamp(dev, -maxDev, maxDev);
    const bend = (rand() - 0.5) * 0.55;
    const end = { x: start.x + Math.cos(a) * len, y: start.y + Math.sin(a) * len };
    const ctrl = {
      x: (start.x + end.x) / 2 - Math.sin(a) * len * bend * 0.5,
      y: (start.y + end.y) / 2 + Math.cos(a) * len * bend * 0.5,
    };
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) pts.push(quad(start, ctrl, end, i / 10));
    const idx = raw.length;
    raw.push({ pts, parent, depth, offset });
    if (depth < 2) {
      const exit = Math.atan2(end.y - ctrl.y, end.x - ctrl.x);
      const fork = 0.3 + rand() * 0.18;
      grow(end, exit - fork * (0.8 + rand() * 0.4), len * (0.66 + rand() * 0.14), depth + 1, idx, offset);
      grow(end, exit + fork * (0.8 + rand() * 0.4), len * (0.66 + rand() * 0.14), depth + 1, idx, offset);
    }
  };
  const nPrim = 5;
  const makeTree = (seed: number): RawBranch[] => {
    rand = rng(seed);
    raw = [];
    for (let i = 0; i < nPrim; i++) {
      const a = Math.PI - spread + (2 * spread * (i + 0.5)) / nPrim + (rand() - 0.5) * 0.18;
      const offset = { x: Math.cos(a) * somaRadius(R, a) * 0.8, y: Math.sin(a) * somaRadius(R, a) * 0.8 };
      grow({ x: 0, y: 0 }, a, 0.85 + rand() * 0.3, 0, -1, offset);
    }
    return raw;
  };
  // Try a few random trees and keep the most balanced one, so it fills the space evenly.
  let bestSeed = 1;
  let bestScore = -1;
  for (let seed = 1; seed <= 24; seed++) {
    let up = 0;
    let down = 0;
    for (const rb of makeTree(seed)) for (const p of rb.pts) {
      up = Math.max(up, -p.y);
      down = Math.max(down, p.y);
    }
    const score = Math.min(up, down) / Math.max(up, down);
    if (score > bestScore) {
      bestScore = score;
      bestSeed = seed;
    }
  }
  raw = makeTree(bestSeed);
  // Scale along and across the cell separately, so the tree fans out to fill the space.
  let ku = Infinity;
  let kv = Infinity;
  const halfB = B / 2 - margin;
  for (const rb of raw) {
    for (const p of rb.pts) {
      if (p.x < 0) ku = Math.min(ku, (somaU + rb.offset.x - margin) / -p.x);
      if (p.x > 0) ku = Math.min(ku, (R * 1.15 - rb.offset.x) / p.x);
      if (p.y > 0) kv = Math.min(kv, (halfB - rb.offset.y) / p.y);
      if (p.y < 0) kv = Math.min(kv, (halfB + rb.offset.y) / -p.y);
    }
  }
  kv = Math.min(kv, ku * 1.6) * 0.97;
  ku = Math.min(ku, kv * 1.4) * 0.97;
  const dendrites: Branch[] = raw.map((rb) => {
    const pts = rb.pts.map((p) => map(somaU + rb.offset.x + ku * p.x, rb.offset.y + kv * p.y));
    return { ...polyline(pts), parent: rb.parent, depth: rb.depth, w0: 0, w1: 0 };
  });
  dendrites.forEach((b) => {
    b.w0 = b.parent < 0 ? R * 0.38 : dendrites[b.parent].w1;
    b.w1 = Math.max(1.4, b.w0 * (b.depth === 2 ? 0.45 : 0.6));
  });
  const leafPath = (i: number) => pathLength({ dendrites } as NeuronGeometry, i, dendrites[i].len);
  const leaves = dendrites.map((_, i) => i).filter((i) => dendrites[i].depth === 2);
  const maxPath = Math.max(...leaves.map(leafPath));

  // ---------- Cell body ----------
  const soma = map(somaU, 0);
  const somaOutline: Pt[] = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const r = somaRadius(R, a);
    somaOutline.push(map(somaU + Math.cos(a) * r, Math.sin(a) * r));
  }
  const nucleus = map(somaU - R * 0.12, R * 0.06);

  // ---------- Axon hillock and axon ----------
  const axonWidth = clamp(R * 0.2, 3, 8);
  const myelinWidth = axonWidth * 3;
  const u0 = somaU + R * 0.7;
  const u1 = somaU + R * 1.85;
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const half = axonWidth / 2 + (R * 0.36 - axonWidth / 2) * (1 - t) * (1 - t);
    top.push(map(u0 + (u1 - u0) * t, -half));
    bottom.push(map(u0 + (u1 - u0) * t, half));
  }
  const hillock = [...top, ...bottom.reverse()];

  const uEnd = L * (vertical ? 0.8 : 0.83);
  const span = uEnd - u1;
  const P0 = { x: u1, y: 0 };
  const P1 = { x: u1 + span * 0.3, y: B * 0.1 };
  const P2 = { x: u1 + span * 0.62, y: -B * 0.1 };
  const P3 = { x: uEnd, y: 0 };
  const cubic = (t: number): Pt => {
    const s = 1 - t;
    return {
      x: s * s * s * P0.x + 3 * s * s * t * P1.x + 3 * s * t * t * P2.x + t * t * t * P3.x,
      y: s * s * s * P0.y + 3 * s * s * t * P1.y + 3 * s * t * t * P2.y + t * t * t * P3.y,
    };
  };
  const axonUV: Pt[] = [];
  for (let i = 0; i <= 120; i++) axonUV.push(cubic(i / 120));
  const axon = polyline(axonUV.map((p) => map(p.x, p.y)));

  const initLen = Math.max(R * 0.75, 14);
  const lastBare = Math.max(R * 0.45, 9);
  const gap = clamp(R * 0.18, 4, 8);
  const avail = axon.len - initLen - lastBare;
  const M = clamp(Math.round(avail / (R * 1.6 + gap)), 4, 8);
  const segLen = (avail - (M - 1) * gap) / M;
  const myelin: [number, number][] = [];
  for (let i = 0; i < M; i++) {
    const s0 = initLen + i * (segLen + gap);
    myelin.push([s0, s0 + segLen]);
  }
  const jumps = [initLen * 0.5, ...myelin.slice(0, -1).map(([, s1]) => s1 + gap / 2), axon.len - lastBare * 0.5];

  // ---------- Axon terminals ----------
  const boutonR = clamp(R * 0.2, 4, 9);
  const exitA = Math.atan2(P3.y - P2.y, P3.x - P2.x);
  const tRaw: { pts: Pt[]; parent: number; depth: number }[] = [];
  for (const da of [-0.62, 0, 0.62]) {
    const a = exitA + da;
    const mid = { x: Math.cos(a), y: Math.sin(a) };
    const idx = tRaw.length;
    tRaw.push({ pts: [{ x: 0, y: 0 }, { x: mid.x * 0.5, y: mid.y * 0.5 + 0.04 }, mid], parent: -1, depth: 0 });
    for (const db of [-0.42, 0.42]) {
      const b = a + db;
      const end = { x: mid.x + Math.cos(b) * 0.75, y: mid.y + Math.sin(b) * 0.75 };
      tRaw.push({ pts: [mid, { x: (mid.x + end.x) / 2, y: (mid.y + end.y) / 2 }, end], parent: idx, depth: 1 });
    }
  }
  let kt = (L - uEnd) * 0.6;
  for (const t of tRaw) {
    for (const p of t.pts) {
      if (p.x > 0) kt = Math.min(kt, (L - margin - boutonR - uEnd) / p.x);
      if (Math.abs(p.y) > 0) kt = Math.min(kt, (halfB - boutonR) / Math.abs(p.y));
    }
  }
  const terminals: Branch[] = tRaw.map((t) => ({
    ...polyline(t.pts.map((p) => map(uEnd + kt * p.x, kt * p.y))),
    parent: t.parent,
    depth: t.depth,
    w0: t.depth === 0 ? axonWidth * 0.85 : axonWidth * 0.55,
    w1: t.depth === 0 ? axonWidth * 0.55 : axonWidth * 0.45,
  }));
  const boutons = terminals.filter((t) => t.depth === 1).map((t) => t.pts[t.pts.length - 1]);

  // ---------- Inhibitory synapse on the cell body ----------
  const thetaI = vertical ? -1.0 : 1.1;
  const ri = clamp(R * 0.27, 7, 12);
  const rS = somaRadius(R, thetaI);
  const contact = map(somaU + Math.cos(thetaI) * rS, Math.sin(thetaI) * rS);
  const boutonUV = { x: somaU + Math.cos(thetaI) * (rS + ri * 0.95), y: Math.sin(thetaI) * (rS + ri * 0.95) };
  const fiber: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const a = thetaI + 0.4 * t;
    const r = ri * 0.8 + R * 1.5 * t;
    const v = clamp(boutonUV.y + Math.sin(a) * r, -halfB, halfB);
    fiber.push(map(boutonUV.x + Math.cos(a) * r, v));
  }
  const inhib = { bouton: map(boutonUV.x, boutonUV.y), r: ri, contact, fiber };

  // ---------- Excitatory synapses drawn on the dendrites ----------
  const markerR = clamp(R * 0.13, 3.5, 6);
  const byAngle = (idx: number[]) =>
    [...idx].sort((a, b) => {
      const pa = dendrites[a].pts[dendrites[a].pts.length - 1];
      const pb = dendrites[b].pts[dendrites[b].pts.length - 1];
      return vertical ? pa.x - pb.x : pa.y - pb.y;
    });
  const sortedLeaves = byAngle(leaves);
  const mids = byAngle(dendrites.map((_, i) => i).filter((i) => dendrites[i].depth === 1));
  const prims = byAngle(dendrites.map((_, i) => i).filter((i) => dendrites[i].depth === 0));
  const pick = (arr: number[], f: number) => arr[Math.min(arr.length - 1, Math.round(f * (arr.length - 1)))];
  const chosen: [number, number][] = [
    [pick(sortedLeaves, 0.08), 0.8],
    [pick(mids, 0.6), 0.55],
    [pick(sortedLeaves, 0.55), 0.8],
    [pick(prims, 0.3), 0.6],
    [pick(sortedLeaves, 0.95), 0.8],
    [pick(mids, 0.2), 0.55],
  ];
  const sites: Site[] = chosen.map(([bi, frac]) => {
    const b = dendrites[bi];
    const s = b.len * frac;
    const at = pointAt(b, s);
    const tg = tangentAt(b, s);
    let n = { x: -tg.y, y: tg.x };
    if ((at.x - soma.x) * n.x + (at.y - soma.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const off = widthAt(b, s) / 2 + markerR * 1.05;
    const marker = { x: at.x + n.x * off, y: at.y + n.y * off };
    const fiberEnd = { x: marker.x + n.x * markerR * 3 + tg.x * markerR * 1.5, y: marker.y + n.y * markerR * 3 + tg.y * markerR * 1.5 };
    return { branch: bi, s, at, marker, fiberEnd };
  });

  // ---------- Labels ----------
  const labels: Label[] = [];
  const fit = (text: string, x: number, align: CanvasTextAlign) => {
    const tw = measure(text);
    if (align === 'center') return clamp(x, margin + tw / 2, w - margin - tw / 2);
    if (align === 'left') return clamp(x, margin, w - margin - tw);
    return clamp(x, margin + tw, w - margin);
  };
  const add = (text: string, x: number, y: number, align: CanvasTextAlign, baseline: CanvasTextBaseline, leader?: [Pt, Pt]) =>
    labels.push({ text, x: fit(text, x, align), y: clamp(y, fontPx, h - 4), align, baseline, leader });
  const segMid = (i: number) => pointAt(axon, (myelin[i][0] + myelin[i][1]) / 2);
  const nodeIdx = Math.max(1, M - 2);
  const node = pointAt(axon, jumps[nodeIdx]);
  const mIdx = M >= 4 ? 2 : 1;
  {
    const pts = dendrites.flatMap((b) => b.pts);
    const minX = Math.min(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    if (!vertical && minY > fontPx * 2.2) add('dendrites', minX, minY - 8, 'left', 'bottom');
    else if (vertical) add('dendrites', minX - 6, minY + fontPx, 'right', 'middle');
    else add('dendrites', margin, margin + fontPx * 0.5, 'left', 'middle');
  }
  if (!vertical) {
    add('cell body (soma)', soma.x + R * 0.1, soma.y - somaRadius(R, -Math.PI / 2) - 10, 'left', 'bottom');
    add('axon hillock', soma.x + R * 2.1, soma.y - R * 0.8, 'left', 'middle', [
      { x: soma.x + R * 2.05, y: soma.y - R * 0.8 },
      { x: soma.x + R * 1.35, y: soma.y - R * 0.22 },
    ]);
    const fEnd = inhib.fiber[inhib.fiber.length - 1];
    add('inhibitory synapse', fEnd.x, fEnd.y + 6, 'center', 'top');
    const a0 = segMid(0);
    add('axon', a0.x, a0.y + myelinWidth / 2 + 6, 'center', 'top');
    const m = segMid(mIdx);
    add('myelin sheath', m.x, m.y - myelinWidth / 2 - 6, 'center', 'bottom');
    add('node of Ranvier', node.x, node.y + myelinWidth / 2 + 6, 'center', 'top');
    const topB = boutons.reduce((a, b) => (b.y < a.y ? b : a));
    const cx = boutons.reduce((s, b) => s + b.x, 0) / boutons.length;
    add('axon terminals', cx, topB.y - boutonR - 6, 'center', 'bottom');
  } else {
    add('cell body (soma)', soma.x + somaRadius(R, Math.PI / 2) + 8, soma.y - R * 0.2, 'left', 'middle');
    add('inhibitory synapse', inhib.bouton.x - ri - 6, inhib.bouton.y + 2, 'right', 'middle');
    add('axon hillock', soma.x + R * 0.5 + 8, soma.y + R * 1.3, 'left', 'middle');
    const a0 = segMid(0);
    add('axon', a0.x - myelinWidth / 2 - 8, a0.y, 'right', 'middle');
    const m = segMid(mIdx);
    add('myelin sheath', m.x + myelinWidth / 2 + 8, m.y, 'left', 'middle');
    add('node of Ranvier', node.x - myelinWidth / 2 - 8, node.y, 'right', 'middle');
    const maxX = Math.max(...boutons.map((b) => b.x));
    const cy = boutons.reduce((s, b) => s + b.y, 0) / boutons.length;
    const tw = measure('axon terminals');
    if (maxX + boutonR + 8 + tw <= w - margin) add('axon terminals', maxX + boutonR + 8, cy, 'left', 'middle');
    else add('axon terminals', Math.min(...boutons.map((b) => b.x)) - boutonR - 8, cy, 'right', 'middle');
  }

  return {
    w,
    h,
    vertical,
    soma,
    R,
    somaOutline,
    nucleus,
    dendrites,
    maxPath,
    hillock,
    axon,
    axonWidth,
    myelinWidth,
    myelin,
    jumps,
    terminals,
    boutons,
    boutonR,
    inhib,
    sites,
    markerR,
    labels,
  };
}
