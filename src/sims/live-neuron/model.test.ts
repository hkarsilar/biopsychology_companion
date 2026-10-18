import { describe, expect, it } from 'vitest';
import { EXC_AMP, INH_AMP, SPONT_AMP, Soma, THRESHOLD_MV, attenuation, travelDelay } from './model';

type In = { t: number; amp: number };

function run(inputs: In[], duration = 60) {
  const soma = new Soma();
  for (const i of inputs) soma.schedule({ ...i, kind: i.amp >= 0 ? 'exc' : 'inh' });
  let spikes = 0;
  let maxV = -Infinity;
  let minV = Infinity;
  for (let k = 0; k < duration / 0.25; k++) {
    soma.advance(0.25, { onSpike: () => spikes++ });
    maxV = Math.max(maxV, soma.V);
    minV = Math.min(minV, soma.V);
  }
  return { spikes, maxV, minV, soma };
}

const near = attenuation(0);
const far = attenuation(1);

describe('live neuron', () => {
  it('stays at rest with no input', () => {
    const { soma, spikes } = run([], 200);
    expect(spikes).toBe(0);
    expect(soma.V).toBeCloseTo(-65, 1);
    expect(soma.quiet()).toBe(true);
  });

  it('never fires from one input, even right next to the cell body', () => {
    const r = run([{ t: 1, amp: EXC_AMP * near }]);
    expect(r.spikes).toBe(0);
    expect(r.maxV).toBeGreaterThan(-63); // a visible bump
    expect(r.maxV).toBeLessThan(THRESHOLD_MV);
  });

  it('distant inputs make smaller bumps than nearby ones', () => {
    expect(run([{ t: 1, amp: EXC_AMP * far }]).maxV).toBeLessThan(run([{ t: 1, amp: EXC_AMP * near }]).maxV);
    expect(travelDelay(1)).toBeGreaterThan(travelDelay(0));
  });

  it('two inputs close together add up and fire a spike, even from the far tips', () => {
    for (const gap of [0, 1, 2]) expect(run([{ t: 1, amp: EXC_AMP * far }, { t: 1 + gap, amp: EXC_AMP * far }]).spikes).toBe(1);
  });

  it('two inputs far apart in time do not add up', () => {
    expect(run([{ t: 1, amp: EXC_AMP * near }, { t: 9, amp: EXC_AMP * near }]).spikes).toBe(0);
  });

  it('inhibition cancels the excitation that would otherwise fire the cell', () => {
    const exc = [
      { t: 1, amp: EXC_AMP * 0.9 },
      { t: 1.5, amp: EXC_AMP * 0.9 },
    ];
    expect(run(exc).spikes).toBe(1);
    expect(run([...exc, { t: 1.2, amp: -INH_AMP }]).spikes).toBe(0);
  });

  it('inhibition alone hyperpolarises the cell by a few millivolts', () => {
    const { minV } = run([{ t: 1, amp: -INH_AMP }]);
    expect(minV).toBeLessThan(-67);
    expect(minV).toBeGreaterThan(-72);
  });

  it('background inputs never fire the cell, even with one real input on top', () => {
    expect(run([{ t: 1, amp: SPONT_AMP }, { t: 1.5, amp: SPONT_AMP }, { t: 2, amp: SPONT_AMP }]).spikes).toBe(0);
    expect(run([{ t: 1, amp: SPONT_AMP }, { t: 1.3, amp: EXC_AMP * near }]).spikes).toBe(0);
  });
});
