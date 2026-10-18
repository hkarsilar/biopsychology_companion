import { describe, expect, it } from 'vitest';
import {
  BRIGHT,
  DIM,
  Sheet,
  STRIP_N,
  contrastSquares,
  decodeProfile,
  encodeProfile,
  hermannPoints,
  imagePattern,
  patchMean,
  rampKnees,
  reflect,
  settle,
  steady,
  stripPattern,
  surround,
  uniformGain,
  CONTRAST,
  IMG_W,
} from './model';

const net = { strength: 0.6, spread: 2.5 };

function edgeOvershoot(strength: number) {
  const e = stripPattern('edge');
  const r = steady(e, { strength, spread: 2.5 });
  const mid = STRIP_N / 2;
  const deepBright = r[STRIP_N - 6];
  const deepDim = r[5];
  return { brightSide: r[mid] - deepBright, dimSide: deepDim - r[mid - 1] };
}

describe('lateral inhibition: the strip', () => {
  it('mirrors indices at the ends', () => {
    expect([-2, -1, 0, 1, 59, 60, 61].map((j) => reflect(j, 60))).toEqual([1, 0, 0, 1, 59, 59, 58]);
  });

  it('has a normalised surround with no self-inhibition', () => {
    const t = surround(2.5);
    expect(t.offsets).not.toContain(0);
    expect(t.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('turns uniform light into flat, lower firing', () => {
    const e = stripPattern('uniform');
    const r = steady(e, net);
    for (const v of r) expect(v).toBeCloseTo(0.6 * uniformGain(net), 4);
  });

  it('copies the input when inhibition is off', () => {
    const e = stripPattern('mach');
    const r = steady(e, { strength: 0, spread: 3 });
    r.forEach((v, i) => expect(v).toBeCloseTo(e[i], 10));
  });

  it('makes an overshoot on the bright side and an undershoot on the dim side of an edge', () => {
    const { brightSide, dimSide } = edgeOvershoot(0.6);
    expect(brightSide).toBeGreaterThan(0.02);
    expect(dimSide).toBeGreaterThan(0.02);
  });

  it('exaggerates edges more when inhibition is stronger', () => {
    expect(edgeOvershoot(0.8).brightSide).toBeGreaterThan(edgeOvershoot(0.3).brightSide);
  });

  it('never fires below zero, even with strong inhibition and a dark bar', () => {
    const e = stripPattern('bar').map((v) => (v === DIM ? 0 : 1));
    for (const ff of [false, true]) {
      const r = steady(e, { strength: 0.9, spread: 1, feedforward: ff });
      for (const v of r) expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('shows Mach bands at the knees of a ramp', () => {
    const e = stripPattern('mach');
    const r = steady(e, { strength: 0.9, spread: 5 });
    const { a, b } = rampKnees(STRIP_N);
    const bright = Math.max(...r.slice(b - 1, b + 4));
    const dark = Math.min(...r.slice(a - 4, a + 1));
    expect(bright).toBeGreaterThan(r[STRIP_N - 2] + 0.02); // light band
    expect(dark).toBeLessThan(r[1] - 0.02); // dark band
  });

  it('settles round by round towards the steady state', () => {
    const e = stripPattern('edge');
    const s = settle(e, net);
    expect(s.converged).toBe(true);
    expect(s.rounds[0].every((v) => v === 0)).toBe(true);
    const final = s.rounds[s.rounds.length - 1];
    const exact = steady(e, net);
    final.forEach((v, i) => expect(v).toBeCloseTo(exact[i], 2));
  });

  it('agrees with the Hartline–Ratliff equation at the steady state', () => {
    const e = stripPattern('staircase');
    const r = steady(e, net);
    const t = surround(net.spread);
    for (let i = 0; i < STRIP_N; i++) {
      let inh = 0;
      t.offsets.forEach((d, k) => (inh += net.strength * t.weights[k] * r[reflect(i + d, STRIP_N)]));
      expect(r[i]).toBeCloseTo(Math.max(0, e[i] - inh), 5);
    }
  });

  it('feed-forward inhibition also sharpens edges', () => {
    const e = stripPattern('edge');
    const r = steady(e, { ...net, feedforward: true });
    expect(r[STRIP_N / 2]).toBeGreaterThan(r[STRIP_N - 6] + 0.02);
  });

  it('round-trips a drawn profile through a link', () => {
    const e = stripPattern('draw');
    const back = decodeProfile(encodeProfile(e))!;
    back.forEach((v, i) => expect(Math.abs(v - e[i])).toBeLessThan(0.02));
    expect(decodeProfile('nonsense!')).toBeNull();
  });

  it('keeps the light values in range', () => {
    for (const p of ['edge', 'staircase', 'bar', 'mach', 'uniform', 'draw'] as const) {
      for (const v of stripPattern(p)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(BRIGHT).toBeGreaterThan(DIM);
  });
});

describe('lateral inhibition: the picture', () => {
  const hermann = imagePattern('hermann');
  const p = { strength: 0.7, spread: 4 };

  it('makes the Hermann-grid crossings darker than the streets between them', () => {
    const sheet = new Sheet();
    sheet.configure(p.spread);
    const r = sheet.steady(hermann.data, p);
    const { crossings, midpoints } = hermannPoints();
    const inner = (q: { x: number; y: number }) => q.x > 10 && q.x < 118 && q.y > 10 && q.y < 86;
    const cross = crossings.filter(inner).map((q) => patchMean(r, IMG_W, q.x, q.y, 1));
    const mid = midpoints.filter(inner).map((q) => patchMean(r, IMG_W, q.x, q.y, 1));
    const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(cross.length).toBeGreaterThan(2);
    expect(avg(cross)).toBeLessThan(avg(mid) - 0.01);
  });

  it('makes the same grey look lighter on a dark surround than on a light one', () => {
    const img = imagePattern('contrast');
    const sheet = new Sheet();
    sheet.configure(p.spread);
    const r = sheet.steady(img.data, p);
    const sq = contrastSquares();
    const h = CONTRAST.side / 2 - 1;
    expect(patchMean(r, IMG_W, sq.onDark.x - 0.5, sq.onDark.y - 0.5, h)).toBeGreaterThan(
      patchMean(r, IMG_W, sq.onLight.x - 0.5, sq.onLight.y - 0.5, h) + 0.02,
    );
    expect(img.data[sq.onDark.y * IMG_W + sq.onDark.x]).toBe(img.data[sq.onLight.y * IMG_W + sq.onLight.x]);
  });

  it('flattens uniform regions and never goes negative', () => {
    const sheet = new Sheet();
    sheet.configure(p.spread);
    const r = sheet.steady(imagePattern('mach').data, { strength: 0.9, spread: 4 });
    for (const v of r) expect(v).toBeGreaterThanOrEqual(0);
    // Far inside the dark plateau the output is flat and equals DIM / (1 + strength).
    expect(r[48 * IMG_W + 5]).toBeCloseTo(DIM / 1.9, 3);
    expect(rampKnees(IMG_W).b).toBeLessThan(IMG_W);
  });

  it('makes the illusory spot vanish where you look, but not in the periphery', () => {
    const sheet = new Sheet();
    const { crossings } = hermannPoints();
    const gaze = crossings.find((q) => q.x === 64 && q.y === 48)!;
    sheet.configure(p.spread, gaze);
    const r = sheet.steady(hermann.data, p);
    const depth = (cx: number, cy: number) => patchMean(r, IMG_W, cx + 11, cy, 0) - patchMean(r, IMG_W, cx, cy, 0);
    const atGaze = depth(gaze.x, gaze.y);
    const far = depth(42, 26);
    expect(far).toBeGreaterThan(0.02);
    expect(atGaze).toBeLessThan(far * 0.5);
  });

  it('solves a picture quickly enough to follow the pointer', () => {
    const sheet = new Sheet();
    sheet.configure(p.spread, { x: 30, y: 30 });
    const t0 = performance.now();
    const r = sheet.steady(hermann.data, p);
    sheet.configure(p.spread, { x: 34, y: 30 });
    sheet.steady(hermann.data, p, { start: r, maxRounds: 12 });
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
