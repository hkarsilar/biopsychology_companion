import { describe, expect, it } from 'vitest';
import { isPartId, JOURNEY, JOURNEY_LENGTH, PART_IDS, PARTS, ROLES, SHAPES, stageAt, stageStart, stepPart } from './model';

describe('parts of the scene', () => {
  it('every part has a name, a job and a place in the journey', () => {
    for (const p of PARTS) {
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.job.length).toBeGreaterThan(40);
      expect(p.journey.length).toBeGreaterThan(30);
    }
  });

  it('ids are unique', () => {
    expect(new Set(PART_IDS).size).toBe(PART_IDS.length);
  });

  it('includes the four kinds of glia', () => {
    const glia = PARTS.filter((p) => p.group === 'glia').map((p) => p.id);
    expect(glia.sort()).toEqual(['astrocyte', 'microglia', 'oligodendrocyte', 'schwann']);
  });

  it('puts oligodendrocytes in the CNS and Schwann cells in the body’s nerves', () => {
    expect(PARTS.find((p) => p.id === 'oligodendrocyte')!.where).toMatch(/brain and spinal cord/);
    expect(PARTS.find((p) => p.id === 'schwann')!.where).toMatch(/nerves of the body/);
  });

  it('never repeats the “ten glia per neuron” myth', () => {
    for (const p of PARTS) expect(`${p.job} ${p.journey}`).not.toMatch(/ten times|10 times|10:1|90 ?%/i);
  });

  it('steps through parts and wraps round', () => {
    expect(stepPart(null, 1)).toBe(PART_IDS[0]);
    expect(stepPart(PART_IDS[PART_IDS.length - 1], 1)).toBe(PART_IDS[0]);
    expect(stepPart(PART_IDS[0], -1)).toBe(PART_IDS[PART_IDS.length - 1]);
    expect(isPartId('soma')).toBe(true);
    expect(isPartId('brain')).toBe(false);
  });
});

describe('follow the signal', () => {
  it('runs in the order a signal really travels', () => {
    expect(JOURNEY.map((s) => s.part)).toEqual(['synapse', 'dendrite', 'soma', 'hillock', 'node', 'terminal']);
  });

  it('only visits parts that exist in the scene', () => {
    for (const s of JOURNEY) expect(isPartId(s.part)).toBe(true);
  });

  it('finds the right stage at any moment, and stays on the last one at the end', () => {
    expect(stageAt(0)).toEqual({ index: 0, p: 0 });
    expect(stageAt(stageStart(3) + 0.01).index).toBe(3);
    expect(stageAt(JOURNEY_LENGTH + 5)).toEqual({ index: JOURNEY.length - 1, p: 1 });
    let last = -1;
    for (let t = 0; t < JOURNEY_LENGTH; t += 0.05) {
      const { index, p } = stageAt(t);
      expect(index).toBeGreaterThanOrEqual(last);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      last = index;
    }
  });
});

describe('neuron shapes and roles', () => {
  it('has the three shapes, each with a role', () => {
    expect(SHAPES.map((s) => s.id)).toEqual(['multipolar', 'bipolar', 'unipolar']);
    for (const s of SHAPES) for (const r of s.roles) expect(ROLES[r]).toBeDefined();
  });

  it('touch neurons are unipolar and sensory', () => {
    const u = SHAPES.find((s) => s.id === 'unipolar')!;
    expect(u.roles).toEqual(['sensory']);
    expect(u.examples).toMatch(/dorsal root ganglia/);
  });
});
