import { describe, expect, it } from 'vitest';
import { buildGeometry, hitTest, pathLength, pathToSoma, pointAt, type Pt } from './geometry';

const sizes: [number, number][] = [
  [1400, 650],
  [1100, 512],
  [800, 450],
  [560, 315],
  [390, 421],
  [320, 346],
];

const inside = (p: Pt, w: number, h: number) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;

describe('live neuron geometry', () => {
  it.each(sizes)('fits every part inside a %i × %i canvas', (w, h) => {
    const g = buildGeometry(w, h);
    const all: Pt[] = [
      ...g.dendrites.flatMap((b) => b.pts),
      ...g.axon.pts,
      ...g.terminals.flatMap((b) => b.pts),
      ...g.somaOutline,
      ...g.inhib.fiber,
      g.inhib.bouton,
      ...g.sites.map((s) => s.marker),
    ];
    for (const p of all) expect(inside(p, w, h), `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`).toBe(true);
    for (const b of g.boutons) {
      expect(b.x + g.boutonR).toBeLessThanOrEqual(w);
      expect(b.y - g.boutonR).toBeGreaterThanOrEqual(0);
      expect(b.y + g.boutonR).toBeLessThanOrEqual(h);
    }
    for (const l of g.labels) expect(inside(l, w, h)).toBe(true);
  });

  it('stands the cell upright on narrow screens', () => {
    expect(buildGeometry(390, 421).vertical).toBe(true);
    expect(buildGeometry(1100, 512).vertical).toBe(false);
  });

  it('has myelin segments with nodes between them, and the spike visits each node in order', () => {
    const g = buildGeometry(1100, 512);
    expect(g.myelin.length).toBeGreaterThanOrEqual(3);
    expect(g.jumps.length).toBe(g.myelin.length + 1);
    for (let i = 1; i < g.jumps.length; i++) expect(g.jumps[i]).toBeGreaterThan(g.jumps[i - 1]);
    expect(g.jumps[g.jumps.length - 1]).toBeLessThanOrEqual(g.axon.len);
  });

  it('finds dendrites, the inhibitory synapse and the axon under the pointer', () => {
    const g = buildGeometry(1100, 512);
    for (const site of g.sites) expect(hitTest(g, site.at.x, site.at.y)?.kind).toBe('dendrite');
    expect(hitTest(g, g.inhib.bouton.x, g.inhib.bouton.y)?.kind).toBe('inhib');
    const mid = pointAt(g.axon, g.axon.len / 2);
    expect(hitTest(g, mid.x, mid.y)?.kind).toBe('axon');
    expect(hitTest(g, g.w - 2, 2)).toBeNull();
  });

  it('routes a signal from any synapse back to the cell body', () => {
    const g = buildGeometry(800, 450);
    for (const site of g.sites) {
      const path = pathToSoma(g, site.branch, site.s);
      expect(path.pts[path.pts.length - 1]).toEqual(g.soma);
      expect(pathLength(g, site.branch, site.s)).toBeLessThanOrEqual(g.maxPath + 1e-6);
    }
  });
});
