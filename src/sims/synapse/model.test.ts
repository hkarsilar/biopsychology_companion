import { describe, expect, it } from 'vitest';
import { C, DRUGS, EXAMPLES, STAGES, Synapse, SYNAPSES, drugEffect, occupancy, singleSpike, type SynEvent } from './model';

describe('synapse model', () => {
  it('stays at rest without a spike', () => {
    const syn = new Synapse('glutamate');
    syn.reset();
    syn.advance(50);
    expect(syn.s.v).toBeCloseTo(C.vRestPost, 3);
    expect(syn.s.released).toBeCloseTo(0, 6);
    expect(syn.s.docked).toBeCloseTo(C.docked, 6);
  });

  it('runs the steps of transmission in the textbook order', () => {
    const { events } = singleSpike('glutamate');
    const order = events.map((e) => e.e);
    const expected: SynEvent[] = ['arrival', 'ca-open', 'ca-in', 'fusion', 'binding', 'channels', 'cleared', 'psp-peak'];
    expect(order.slice(0, expected.length)).toEqual(expected);
    for (const e of order) expect(STAGES.some((s) => s.id === e)).toBe(true);
  });

  it('the synaptic delay from arrival to release is under a millisecond', () => {
    const { events } = singleSpike('glutamate');
    const at = (e: SynEvent) => events.find((x) => x.e === e)!.t;
    expect(at('fusion') - at('arrival')).toBeGreaterThan(0.3);
    expect(at('fusion') - at('arrival')).toBeLessThan(1.2);
  });

  it('releases about a third of the docked vesicles per spike', () => {
    const r = singleSpike('glutamate');
    expect(r.released / C.docked).toBeGreaterThan(0.25);
    expect(r.released / C.docked).toBeLessThan(0.45);
  });

  it('glutamate and acetylcholine make EPSPs; GABA and serotonin make IPSPs', () => {
    expect(singleSpike('glutamate').peakDv).toBeGreaterThan(3);
    expect(singleSpike('ach').peakDv).toBeGreaterThan(3);
    expect(singleSpike('gaba').peakDv).toBeLessThan(-1.5);
    expect(singleSpike('serotonin', 'none', 400).peakDv).toBeLessThan(-2);
  });

  it('a single EPSP stays below threshold', () => {
    const r = singleSpike('glutamate');
    expect(r.base + r.peakDv).toBeLessThan(C.threshold);
  });

  it('the metabotropic response is much slower than the ionotropic one', () => {
    const fast = singleSpike('glutamate').events.find((e) => e.e === 'psp-peak')!.t;
    const slow = singleSpike('serotonin', 'none', 400).events.find((e) => e.e === 'psp-peak')!.t;
    expect(slow).toBeGreaterThan(fast * 5);
  });

  it('a reuptake blocker keeps transmitter in the cleft longer and enlarges the PSP', () => {
    const ctrl = singleSpike('serotonin', 'none', 400);
    const ssri = singleSpike('serotonin', 'reuptake', 400);
    expect(ssri.cleftHalfTime).toBeGreaterThan(ctrl.cleftHalfTime * 2);
    expect(ssri.pspArea).toBeGreaterThan(ctrl.pspArea * 2);
  });

  it('a competitive antagonist shrinks the PSP without changing release', () => {
    const ctrl = singleSpike('ach');
    const curare = singleSpike('ach', 'antagonist');
    expect(curare.released).toBeCloseTo(ctrl.released, 3);
    expect(curare.peakDv).toBeLessThan(ctrl.peakDv * 0.5);
  });

  it('blocking acetylcholinesterase prolongs acetylcholine and can push the PSP past threshold', () => {
    const ctrl = singleSpike('ach');
    const blocked = singleSpike('ach', 'enzyme');
    expect(blocked.cleftHalfTime).toBeGreaterThan(ctrl.cleftHalfTime);
    expect(blocked.base + blocked.peakDv).toBeGreaterThan(C.threshold);
  });

  it('drugs with nothing to act on do nothing', () => {
    expect(drugEffect('reuptake', SYNAPSES.ach).hasTarget).toBe(false);
    expect(drugEffect('enzyme', SYNAPSES.glutamate).hasTarget).toBe(false);
    expect(singleSpike('ach', 'reuptake').peakDv).toBeCloseTo(singleSpike('ach').peakDv, 6);
  });

  it('a release blocker almost abolishes release; a release booster increases it', () => {
    const ctrl = singleSpike('ach');
    expect(singleSpike('ach', 'release-block').released).toBeLessThan(ctrl.released * 0.1);
    expect(singleSpike('ach', 'release-boost').released).toBeGreaterThan(ctrl.released * 1.5);
  });

  it('MDMA-like release keeps serotonin in the cleft without spikes; reserpine empties the vesicles', () => {
    const mdma = new Synapse('serotonin', 'release-boost');
    mdma.reset();
    expect(mdma.steadyCleft()).toBeGreaterThan(0.3);
    expect(mdma.baseline()).toBeLessThan(C.vRestPost - 2);
    const ctrl = singleSpike('serotonin', 'none', 400);
    const reserpine = singleSpike('serotonin', 'release-block', 400);
    expect(reserpine.released).toBeCloseTo(ctrl.released, 1);
    expect(Math.abs(reserpine.peakDv)).toBeLessThan(Math.abs(ctrl.peakDv) * 0.2);
  });

  it('every drug has a real example, or says plainly that it has nothing to act on', () => {
    for (const t of Object.keys(EXAMPLES) as (keyof typeof EXAMPLES)[]) {
      for (const d of DRUGS.filter((x) => x.id !== 'none')) {
        const text = EXAMPLES[t][d.id as Exclude<typeof d.id, 'none'>];
        expect(text.length).toBeGreaterThan(5);
        expect(text.startsWith('Nothing to block')).toBe(!drugEffect(d.id, SYNAPSES[t]).hasTarget);
      }
    }
  });

  it('an agonist shifts the resting voltage and leaves less room for the PSP', () => {
    const ctrl = singleSpike('glutamate');
    const ago = singleSpike('glutamate', 'agonist');
    expect(ago.base).toBeGreaterThan(ctrl.base + 2);
    expect(ago.base).toBeLessThan(C.threshold);
    expect(ago.peakDv).toBeLessThan(ctrl.peakDv);
  });

  it('occupancy follows competition between transmitter and antagonist', () => {
    const none = drugEffect('none', SYNAPSES.glutamate);
    const anta = drugEffect('antagonist', SYNAPSES.glutamate);
    expect(occupancy(0, 1, none)).toBe(0);
    expect(occupancy(1, 1, none)).toBeCloseTo(0.5, 6);
    expect(occupancy(1, 1, anta)).toBeLessThan(0.2);
    // Lots of transmitter outcompetes the antagonist.
    expect(occupancy(100, 1, anta)).toBeGreaterThan(0.9);
  });

  it('a fast burst depletes docked vesicles, so later spikes release less', () => {
    const syn = new Synapse('glutamate');
    syn.reset();
    const perSpike: number[] = [];
    for (let i = 0; i < 5; i++) {
      const before = syn.s.released;
      syn.fire();
      syn.advance(20);
      perSpike.push(syn.s.released - before);
    }
    expect(perSpike[4]).toBeLessThan(perSpike[0] * 0.8);
    syn.advance(1500);
    expect(syn.s.docked).toBeGreaterThan(C.docked - 0.2);
  });

  it('two spikes close together add up to a bigger PSP (temporal summation)', () => {
    const one = singleSpike('glutamate').peakDv;
    const syn = new Synapse('glutamate');
    syn.reset();
    syn.fire(1);
    syn.fire(4);
    let peak = 0;
    while (syn.s.t < 40) {
      syn.advance(0.05);
      peak = Math.max(peak, syn.s.v - C.vRestPost);
    }
    expect(peak).toBeGreaterThan(one * 1.4);
  });

  it('steps from one event to the next and reports simultaneous events one at a time', () => {
    const syn = new Synapse('glutamate');
    syn.reset();
    syn.fire(0.5);
    const seen: SynEvent[] = [];
    for (let i = 0; i < 9; i++) {
      const e = syn.advanceToNextEvent();
      if (e) seen.push(e);
    }
    expect(seen).toEqual(['arrival', 'ca-open', 'ca-in', 'fusion', 'binding', 'channels', 'cleared', 'psp-peak', 'recycled']);
    expect(syn.tracking()).toBe(false);
  });
});
