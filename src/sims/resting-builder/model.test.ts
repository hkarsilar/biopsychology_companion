import { describe, expect, it } from 'vitest';
import { nernst, rtf } from '../resting-potential/ions';
import { evolve, ghk, ghkFlux, PRESETS, pToSlider, pulls, runDown, sliderToP, typicalConcs } from './model';

describe('Goldman–Hodgkin–Katz equation', () => {
  it('matches a hand calculation for a typical neuron (1 : 0.04 : 0.45)', () => {
    // num = 5 + 0.04·145 + 0.45·10 = 15.3; den = 140 + 0.04·12 + 0.45·110 = 189.98
    const expected = rtf(37) * Math.log(15.3 / 189.98);
    expect(ghk({ k: 1, na: 0.04, cl: 0.45 }, typicalConcs(), 37)).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(-67.3, 1);
  });

  it('collapses to the Nernst potential when only one ion can cross', () => {
    const C = typicalConcs();
    expect(ghk({ k: 1, na: 0, cl: 0 }, C)).toBeCloseTo(nernst(1, 140, 5), 6);
    expect(ghk({ k: 0, na: 1, cl: 0 }, C)).toBeCloseTo(nernst(1, 12, 145), 6);
    expect(ghk({ k: 0, na: 0, cl: 1 }, C)).toBeCloseTo(nernst(-1, 10, 110), 6);
  });

  it('gives about −62 mV for the squid giant axon values', () => {
    const p = PRESETS.squid;
    expect(ghk(p.P, p.C, p.tempC)).toBeCloseTo(-62.3, 0);
  });

  it('raising potassium outside depolarises the membrane', () => {
    const p = PRESETS.hyperkalaemia;
    const v = ghk(p.P, p.C, 37);
    expect(v).toBeGreaterThan(ghk(PRESETS.neuron.P, PRESETS.neuron.C, 37) + 8);
  });

  it('a big rise in sodium permeability swings the voltage towards E_Na, as at the peak of a spike', () => {
    const p = PRESETS['spike-peak'];
    expect(ghk(p.P, p.C, 37)).toBeGreaterThan(40);
  });

  it('the pump adds a few millivolts of its own (Mullins–Noda)', () => {
    const p = PRESETS.neuron;
    const extra = ghk(p.P, p.C, 37, true) - ghk(p.P, p.C, 37, false);
    expect(extra).toBeLessThan(-2);
    expect(extra).toBeGreaterThan(-8);
  });

  it('is undefined when no ion can cross', () => {
    expect(ghk({ k: 0, na: 0, cl: 0 }, typicalConcs())).toBeNaN();
  });
});

describe('pulls on the voltage', () => {
  it('the resting voltage is the pull-weighted average of the Nernst potentials', () => {
    for (const p of Object.values(PRESETS)) {
      const V = ghk(p.P, p.C, p.tempC);
      const sharesTotal = pulls(p.P, p.C, V, p.tempC).reduce((s, x) => s + x.share, 0);
      const avg = pulls(p.P, p.C, V, p.tempC).reduce((s, x) => s + x.share * x.E, 0);
      expect(sharesTotal).toBeCloseTo(1, 9);
      expect(avg).toBeCloseTo(V, 4);
    }
  });

  it('potassium pulls hardest at rest', () => {
    const p = PRESETS.neuron;
    const share = pulls(p.P, p.C, ghk(p.P, p.C, 37), 37);
    const k = share.find((x) => x.ion === 'k')!.share;
    expect(k).toBeGreaterThan(0.5);
  });
});

describe('fluxes and run-down', () => {
  it('no net flux at an ion’s own Nernst potential', () => {
    const E = nernst(1, 140, 5);
    expect(ghkFlux('k', 1, 140, 5, E)).toBeCloseTo(0, 9);
  });

  it('K⁺ leaks out and Na⁺ leaks in at rest', () => {
    expect(ghkFlux('k', 1, 140, 5, -70)).toBeGreaterThan(0);
    expect(ghkFlux('na', 0.04, 12, 145, -70)).toBeLessThan(0);
  });

  it('without the pump the gradients and the voltage slowly run down', () => {
    const s = { ...PRESETS['pump-off'] };
    const v0 = ghk(s.P, s.C, 37);
    const after1h = runDown(s, 1);
    const after12h = runDown(s, 12);
    const v1 = ghk(s.P, after1h, 37);
    const v12 = ghk(s.P, after12h, 37);
    expect(Math.abs(v1 - v0)).toBeLessThan(10);
    expect(v12).toBeGreaterThan(v0 + 25);
    expect(after12h.k.in).toBeLessThan(100);
    expect(after12h.na.in).toBeGreaterThan(40);
  });
});

describe('the pump', () => {
  it('holds the gradients steady while it runs', () => {
    const p = PRESETS.neuron;
    const C = evolve({ ...p }, p.C, 24);
    expect(C.k.in).toBeCloseTo(140, 6);
    expect(C.na.in).toBeCloseTo(12, 6);
  });

  it('wins back gradients that ran down once it is switched on again', () => {
    const p = PRESETS.neuron;
    const v0 = ghk(p.P, p.C, 37, true);
    const down = runDown({ ...p, pump: false }, 12);
    const back = evolve({ ...p, C: down, pump: true }, p.C, 4);
    expect(Math.abs(ghk(p.P, back, 37, true) - v0)).toBeLessThan(1);
  });
});

describe('permeability slider', () => {
  it('maps 70 to 1 and 0 to nothing, and back', () => {
    expect(sliderToP(70)).toBeCloseTo(1, 9);
    expect(sliderToP(0)).toBe(0);
    for (const P of [0.002, 0.04, 0.45, 1, 15]) expect(sliderToP(pToSlider(P))).toBeCloseTo(P, 6);
  });
});
