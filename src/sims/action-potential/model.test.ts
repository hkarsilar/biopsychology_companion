import { describe, expect, it } from 'vitest';
import {
  countSpikes,
  defaultParams,
  restingState,
  simulate,
  sodiumIonsPerUm2,
  squidInternalNaChange,
} from './model';

const zap = (amplitude: number, start = 1, duration = 0.5) => ({ start, duration, amplitude });

function width(trace: { t: number; V: number }[], level = -20) {
  const above = trace.filter((s) => s.V > level);
  return above.length ? above[above.length - 1].t - above[0].t : 0;
}

describe('Hodgkin–Huxley membrane', () => {
  it('rests near −65 mV', () => {
    expect(restingState().V).toBeCloseTo(-65, 0);
  });

  it('fires one full spike for a strong zap, peaking near +40 mV', () => {
    const tr = simulate(20, [zap(20)]);
    expect(countSpikes(tr)).toBe(1);
    const peak = Math.max(...tr.map((s) => s.V));
    expect(peak).toBeGreaterThan(30);
    expect(peak).toBeLessThan(50);
  });

  it('has a threshold for a 0.5 ms pulse between 12 and 15 µA/cm²', () => {
    expect(countSpikes(simulate(20, [zap(12)]))).toBe(0);
    expect(countSpikes(simulate(20, [zap(15)]))).toBe(1);
  });

  it('is all-or-none: doubling a suprathreshold stimulus barely changes the peak', () => {
    const p1 = Math.max(...simulate(20, [zap(15)]).map((s) => s.V));
    const p2 = Math.max(...simulate(20, [zap(30)]).map((s) => s.V));
    expect(Math.abs(p1 - p2)).toBeLessThan(5);
  });

  it('dips below rest after a spike (the undershoot)', () => {
    const min = Math.min(...simulate(20, [zap(20)]).map((s) => s.V));
    expect(min).toBeLessThan(-72);
  });

  it('cannot fire again 3 ms later (absolute refractory period)', () => {
    expect(countSpikes(simulate(30, [zap(20), zap(60, 4)]))).toBe(1);
  });

  it('fires again 20 ms later', () => {
    expect(countSpikes(simulate(40, [zap(20), zap(20, 21)]))).toBe(2);
  });

  it('fires repeatedly with a steady current, faster for more current', () => {
    const slow = countSpikes(simulate(200, [], defaultParams, { hold: 10 }));
    const fast = countSpikes(simulate(200, [], defaultParams, { hold: 40 }));
    expect(slow).toBeGreaterThan(5);
    expect(fast).toBeGreaterThan(slow);
  });

  it('cannot fire with TTX', () => {
    const p = { ...defaultParams, naBlock: 1 };
    expect(countSpikes(simulate(20, [zap(50)], p, { start: restingState() }))).toBe(0);
  });

  it('makes a wider spike with TEA, and still returns to rest', () => {
    const p = { ...defaultParams, kBlock: 0.9 };
    const tr = simulate(60, [zap(20)], p, { start: restingState() });
    expect(countSpikes(tr)).toBe(1);
    expect(width(tr)).toBeGreaterThan(2 * width(simulate(20, [zap(20)])) - 0.5);
    expect(tr[tr.length - 1].V).toBeCloseTo(-65, 0);
  });

  it('does not fire on its own after TEA is added', () => {
    const p = { ...defaultParams, kBlock: 0.9 };
    expect(countSpikes(simulate(100, [], p, { start: restingState() }))).toBe(0);
  });

  it('makes a much longer spike when inactivation is slowed', () => {
    const p = { ...defaultParams, inactivationSlowing: 8 };
    const tr = simulate(60, [zap(20)], p, { start: restingState() });
    expect(countSpikes(tr)).toBe(1);
    expect(width(tr)).toBeGreaterThan(6);
  });

  it('moves tens of thousands of Na⁺ ions per µm² in one spike, a tiny share of what is inside', () => {
    const n = sodiumIonsPerUm2(simulate(20, [zap(20)]));
    expect(n).toBeGreaterThan(20_000);
    expect(n).toBeLessThan(200_000);
    expect(squidInternalNaChange(n)).toBeLessThan(0.0001);
  });
});
