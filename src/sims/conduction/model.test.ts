import { describe, expect, it } from 'vitest';
import { Axon, AXONS, race } from './model';

describe('conduction along a Hodgkin–Huxley cable', () => {
  const thin = race(AXONS.thin);
  const thick = race(AXONS.thick);
  const squid = race(AXONS.squid);
  const myelinated = race(AXONS.myelinated);

  it('reproduces Hodgkin and Huxley’s own result: about 18.8 m/s in the squid giant axon at 18.5 °C', () => {
    expect(squid.speed).toBeGreaterThan(17);
    expect(squid.speed).toBeLessThan(21);
  });

  it('every healthy axon carries the spike to the end of the track', () => {
    for (const r of [thin, thick, squid, myelinated]) expect(r.blocked).toBe(false);
  });

  it('thicker bare axons are faster, roughly with the square root of diameter', () => {
    expect(thick.speed).toBeGreaterThan(thin.speed);
    const ratio = thick.speed / thin.speed;
    expect(ratio).toBeGreaterThan(2.6);
    expect(ratio).toBeLessThan(3.8); // √10 ≈ 3.2
  });

  it('a 10 µm myelinated axon beats a bare axon of the same size many times over, and even the squid giant axon', () => {
    expect(myelinated.speed).toBeGreaterThan(thick.speed * 5);
    expect(myelinated.speed).toBeGreaterThan(squid.speed);
  });

  it('thin bare axons are about 1 m/s, like the C fibres that carry slow pain', () => {
    expect(thin.speed).toBeGreaterThan(0.5);
    expect(thin.speed).toBeLessThan(1.5);
  });

  it('losing some myelin slows the spike; losing it all blocks conduction', () => {
    const half = race(AXONS.damaged, { damage: 0.5 });
    const most = race(AXONS.damaged, { damage: 0.9 });
    const all = race(AXONS.damaged, { damage: 1 });
    expect(half.blocked).toBe(false);
    expect(most.blocked).toBe(false);
    expect(half.finish).toBeGreaterThan(myelinated.finish);
    expect(most.finish).toBeGreaterThan(half.finish);
    expect(all.blocked).toBe(true);
    // The slider only affects the axon with the damaged stretch.
    expect(race(AXONS.myelinated, { damage: 1 }).blocked).toBe(false);
  });

  it('a spike started in the middle travels both ways', () => {
    const ax = new Axon(AXONS.thick, { stim: 'middle' });
    ax.run(5);
    expect(Number.isNaN(ax.arrival[0])).toBe(false);
    expect(Number.isNaN(ax.arrival[ax.n - 1])).toBe(false);
    expect(ax.arrival[0]).toBeCloseTo(ax.arrival[ax.n - 1], 1);
  });

  it('settles back to rest after the spike has passed', () => {
    const ax = new Axon(AXONS.thick);
    ax.run(20);
    expect(ax.maxV()).toBeLessThan(-55);
  });

  it('only nodes of Ranvier have channels in a myelinated axon', () => {
    const ax = new Axon(AXONS.myelinated);
    const nodes = Array.from(ax.isNode).filter(Boolean).length;
    expect(nodes).toBe(11); // 10 internodes of 1 mm on a 1 cm track
  });
});
