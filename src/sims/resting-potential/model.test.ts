import { describe, expect, it } from 'vitest';
import { rng } from '../shared/canvas';
import { forces, ionsInside, ionsToCharge, IONS, nernst, rtf } from './ions';
import { MV_PER_ION, TugModel } from './model';

describe('Nernst equation', () => {
  it('RT/F is about 26.7 mV at body temperature', () => {
    expect(rtf(37)).toBeCloseTo(26.73, 1);
  });

  it('gives the textbook equilibrium potentials for a mammalian neuron', () => {
    expect(nernst(1, IONS.k.cIn, IONS.k.cOut)).toBeCloseTo(-89.1, 0);
    expect(nernst(1, IONS.na.cIn, IONS.na.cOut)).toBeCloseTo(66.6, 0);
    expect(nernst(-1, IONS.cl.cIn, IONS.cl.cOut)).toBeCloseTo(-64.1, 0);
  });

  it('is zero when the concentrations are equal', () => {
    expect(nernst(1, 50, 50)).toBeCloseTo(0, 6);
  });

  it('a tenfold gradient is worth about 61.5 mV at 37 °C', () => {
    expect(nernst(1, 100, 10)).toBeCloseTo(-61.5, 0);
  });

  it('the two forces cancel exactly at the Nernst potential', () => {
    for (const ion of Object.values(IONS)) {
      const E = nernst(ion.z, ion.cIn, ion.cOut);
      expect(forces(ion.z, ion.cIn, ion.cOut, E).net).toBeCloseTo(0, 9);
    }
  });
});

describe('only a tiny fraction of ions needs to cross', () => {
  it('charging a 25 µm cell to −89 mV moves about 11 million K⁺ out of about 700 billion', () => {
    const moved = ionsToCharge(-89);
    const inside = ionsInside(140);
    expect(moved).toBeGreaterThan(9e6);
    expect(moved).toBeLessThan(13e6);
    expect(inside).toBeGreaterThan(6e11);
    expect(moved / inside).toBeLessThan(1e-4);
  });
});

describe('Ion tug-of-war model', () => {
  const settle = (m: TugModel, seconds = 120) => {
    m.open = true;
    for (let i = 0; i < seconds * 50; i++) m.stepMean(0.02);
    return m.Vmean();
  };

  it('starts at 0 mV with the channels closed and nothing flowing', () => {
    const m = new TugModel();
    expect(m.V()).toBe(0);
    expect(m.rates()).toEqual({ out: 0, in: 0 });
  });

  it('K⁺ leaks out first, making the inside negative', () => {
    const m = new TugModel({ ion: 'k' });
    m.open = true;
    const r = m.rates();
    expect(r.out).toBeGreaterThan(r.in);
  });

  it.each(['k', 'na', 'cl'] as const)('the average voltage settles at the Nernst potential for %s', (ion) => {
    const m = new TugModel({ ion });
    expect(settle(m)).toBeCloseTo(m.nernst(), 1);
  });

  it('follows changes in concentration and temperature', () => {
    const m = new TugModel({ ion: 'k', cIn: 140, cOut: 20, tempC: 20 });
    expect(settle(m)).toBeCloseTo(nernst(1, 140, 20, 20), 1);
  });

  it('flow continues both ways at equilibrium: the balance is dynamic', () => {
    const m = new TugModel({ ion: 'k' });
    settle(m);
    const r = m.rates(m.Vmean());
    expect(r.out).toBeGreaterThan(0.5);
    expect(r.out).toBeCloseTo(r.in, 3);
  });

  it('random crossings hover around the Nernst potential', () => {
    const m = new TugModel({ ion: 'k' });
    m.open = true;
    const rand = rng(42);
    let sum = 0;
    let count = 0;
    for (let i = 0; i < 60 * 600; i++) {
      m.step(1 / 60, rand);
      if (m.t > 60) {
        sum += m.V();
        count++;
      }
    }
    expect(Math.abs(sum / count - m.nernst())).toBeLessThan(MV_PER_ION * 1.5);
  });
});
