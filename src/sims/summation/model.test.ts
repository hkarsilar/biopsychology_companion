import { describe, expect, it } from 'vitest';
import { SUM, SummationModel, attenuation, kernel, pattern, simulate, type InputKind } from './model';

const E = (site: number, distance: number) => ({ site, distance, kind: 'exc' as InputKind });
const I = (site: number, distance: number) => ({ site, distance, kind: 'inh' as InputKind });

describe('summation model', () => {
  it('rests at −70 mV with no input', () => {
    const m = new SummationModel();
    m.advance(100);
    expect(m.v).toBeCloseTo(SUM.vRest, 6);
    expect(m.spikes).toHaveLength(0);
  });

  it('the synaptic kernel has unit area', () => {
    let area = 0;
    for (let s = 0; s < 200; s += 0.01) area += kernel(s, 0.5, 2) * 0.01;
    expect(area).toBeCloseTo(1, 2);
  });

  it('one EPSP, even at the cell body, stays below threshold', () => {
    for (const d of [0, 80, 220, 400]) {
      const r = simulate(pattern([E(1, d)], 1, 0, 5));
      expect(r.spikes).toBe(0);
      expect(r.peak).toBeLessThan(SUM.threshold);
      expect(r.peak).toBeGreaterThan(SUM.vRest);
    }
  });

  it('EPSPs shrink with distance from the soma', () => {
    const near = simulate(pattern([E(1, 80)], 1, 0, 5)).peak;
    const far = simulate(pattern([E(1, 400)], 1, 0, 5)).peak;
    expect(near - SUM.vRest).toBeGreaterThan(2 * (far - SUM.vRest));
    expect(attenuation(300, 300)).toBeCloseTo(Math.exp(-1), 6);
  });

  it('spatial summation: two nearby synapses together reach threshold', () => {
    expect(simulate(pattern([E(1, 80), E(2, 100)], 1, 0, 5)).spikes).toBe(1);
  });

  it('temporal summation: one synapse firing quickly reaches threshold, slowly it does not', () => {
    expect(simulate(pattern([E(1, 80)], 3, 4, 5)).spikes).toBe(1);
    expect(simulate(pattern([E(1, 80)], 3, 30, 5)).spikes).toBe(0);
  });

  it('a longer membrane time constant gives more temporal summation', () => {
    const inputs = pattern([E(1, 80)], 3, 8, 5);
    expect(simulate(inputs, { tauM: 5, lambda: 300 }).spikes).toBe(0);
    expect(simulate(inputs, { tauM: 30, lambda: 300 }).spikes).toBe(1);
  });

  it('a longer length constant lets distant synapses count for more', () => {
    const far = pattern([E(1, 400), E(2, 260), E(3, 330)], 1, 0, 5);
    expect(simulate(far, { tauM: 15, lambda: 150 }).spikes).toBe(0);
    expect(simulate(far, { tauM: 15, lambda: 800 }).spikes).toBe(1);
  });

  it('an IPSP hyperpolarises towards the chloride equilibrium potential', () => {
    const r = simulate(pattern([I(0, 0)], 1, 0, 5));
    expect(r.trough).toBeLessThan(SUM.vRest - 3);
    expect(r.trough).toBeGreaterThan(SUM.eCl);
  });

  it('inhibition at the soma vetoes excitation that would otherwise fire the cell', () => {
    const exc = [E(1, 80), E(2, 100)];
    expect(simulate(pattern(exc, 1, 0, 5)).spikes).toBe(1);
    expect(simulate(pattern([...exc, I(0, 0)], 1, 0, 5)).spikes).toBe(0);
  });

  it('inhibition far out on a dendrite is much weaker than inhibition at the soma', () => {
    const exc = [E(1, 80), E(2, 100)];
    const nearI = simulate(pattern([...exc, I(0, 0)], 1, 0, 5)).peak;
    const farI = simulate(pattern([...exc, I(3, 400)], 1, 0, 5)).peak;
    expect(farI - SUM.vRest).toBeGreaterThan(2 * (nearI - SUM.vRest));
  });

  it('strong, fast input makes a train of spikes with a refractory gap', () => {
    const m = new SummationModel();
    for (const p of pattern([E(1, 80), E(2, 100), E(3, 150), E(0, 0)], 5, 3, 5)) m.trigger(p.site, p.distance, p.kind, p.t);
    m.advance(80);
    expect(m.spikes.length).toBeGreaterThan(1);
    for (let i = 1; i < m.spikes.length; i++) expect(m.spikes[i] - m.spikes[i - 1]).toBeGreaterThanOrEqual(SUM.refractory);
  });

  it('tracks each input alone so the drawing can show the parts and the sum', () => {
    const m = new SummationModel();
    const a = m.trigger(1, 80, 'exc', 1);
    const b = m.trigger(2, 220, 'exc', 1);
    let peakA = 0;
    let peakB = 0;
    for (let k = 0; k < 300; k++) {
      m.advance(0.1);
      peakA = Math.max(peakA, a.alone);
      peakB = Math.max(peakB, b.alone);
    }
    expect(peakA).toBeGreaterThan(peakB);
    expect(peakA).toBeCloseTo(simulate(pattern([E(1, 80)], 1, 0, 1)).peak - SUM.vRest, 0);
  });
});
