import { describe, expect, it } from 'vitest';
import { checkCategories, inPlaceCount, move, parseConfig, scrambledOrder, shuffle } from './model';

describe('sorter logic', () => {
  it('shuffles deterministically and keeps every item', () => {
    const a = shuffle([1, 2, 3, 4, 5, 6], 42);
    expect(shuffle([1, 2, 3, 4, 5, 6], 42)).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('never starts an order puzzle mostly solved', () => {
    for (let seed = 1; seed < 60; seed++) {
      const order = scrambledOrder(9, seed);
      expect([...order].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(inPlaceCount(order)).toBeLessThan(3);
    }
    expect(inPlaceCount(scrambledOrder(2, 5))).toBe(0);
  });

  it('moves items up and down, and not past the ends', () => {
    expect(move([0, 1, 2], 1, -1)).toEqual([1, 0, 2]);
    expect(move([0, 1, 2], 1, 1)).toEqual([0, 2, 1]);
    expect(move([0, 1, 2], 0, -1)).toEqual([0, 1, 2]);
    expect(move([0, 1, 2], 2, 1)).toEqual([0, 1, 2]);
  });

  it('checks a categories sort, ignoring cards not yet placed', () => {
    const items = [
      { text: 'a', bin: 'x' },
      { text: 'b', bin: 'y' },
      { text: 'c', bin: 'x' },
    ];
    const r = checkCategories(items, ['x', 'x', null]);
    expect(r.marks).toEqual([true, false, null]);
    expect(r.right).toBe(1);
    expect(r.placed).toBe(2);
    expect(r.total).toBe(3);
  });

  it('rejects broken configs with a clear message', () => {
    expect(() => parseConfig(null)).toThrow(/missing/);
    expect(() => parseConfig(JSON.stringify({ mode: 'order', items: [{ text: 'one' }] }))).toThrow(/two items/);
    expect(() =>
      parseConfig(JSON.stringify({ mode: 'categories', bins: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], items: [{ text: 'x', bin: 'c' }, { text: 'y', bin: 'a' }] })),
    ).toThrow(/unknown bin/);
    expect(parseConfig(JSON.stringify({ mode: 'order', items: [{ text: 'one' }, { text: 'two' }] })).mode).toBe('order');
  });
});
