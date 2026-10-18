/**
 * Logic for the sorter: shuffling, checking a categories sort and checking an order.
 * Kept free of the DOM so it can be tested on its own.
 */

export interface SorterBin {
  id: string;
  label: string;
}

export interface SorterItem {
  text: string;
  /** Categories mode: the id of the right bin */
  bin?: string;
  /** Shown after checking */
  explain?: string;
}

export interface SorterConfig {
  mode: 'categories' | 'order';
  title?: string;
  prompt?: string;
  bins?: SorterBin[];
  /** Order mode: give the items in the right order */
  items: SorterItem[];
}

/** Deterministic shuffle (xorshift), so a given seed always gives the same order. */
export function shuffle<T>(list: T[], seed: number): T[] {
  const out = list.slice();
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled order of indices that is never already correct (for lists of 2 or more). */
export function scrambledOrder(n: number, seed: number): number[] {
  const ids = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return ids;
  for (let k = 0; k < 20; k++) {
    const order = shuffle(ids, seed + k * 7919);
    if (inPlaceCount(order) < Math.max(1, Math.floor(n / 3))) return order;
  }
  // Fall back to a rotation, which has no item in place.
  return ids.map((i) => (i + 1) % n);
}

/** Number of items that sit at their correct position (index i holds item i). */
export function inPlaceCount(order: number[]): number {
  return order.reduce((n, item, pos) => n + (item === pos ? 1 : 0), 0);
}

/** Move the item at `from` one place up (−1) or down (+1). Returns a new array. */
export function move(order: number[], from: number, dir: -1 | 1): number[] {
  const to = from + dir;
  if (to < 0 || to >= order.length) return order.slice();
  const out = order.slice();
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

export interface CategoryResult {
  right: number;
  placed: number;
  total: number;
  /** For each item index: true (right), false (wrong) or null (not placed yet) */
  marks: (boolean | null)[];
}

/** Check a categories sort. `placement[i]` is the bin id chosen for item i, or null. */
export function checkCategories(items: SorterItem[], placement: (string | null)[]): CategoryResult {
  const marks = items.map((it, i) => (placement[i] == null ? null : placement[i] === it.bin));
  return {
    right: marks.filter((m) => m === true).length,
    placed: marks.filter((m) => m !== null).length,
    total: items.length,
    marks,
  };
}

/** Parse and sanity-check a config, throwing a readable error for authors. */
export function parseConfig(raw: string | null): SorterConfig {
  if (!raw) throw new Error('nc-sorter: missing data-config');
  const c = JSON.parse(raw) as SorterConfig;
  if (c.mode !== 'categories' && c.mode !== 'order') throw new Error('nc-sorter: mode must be "categories" or "order"');
  if (!Array.isArray(c.items) || c.items.length < 2) throw new Error('nc-sorter: needs at least two items');
  if (c.mode === 'categories') {
    const ids = new Set((c.bins ?? []).map((b) => b.id));
    if (ids.size < 2) throw new Error('nc-sorter: categories mode needs at least two bins');
    for (const it of c.items) if (!it.bin || !ids.has(it.bin)) throw new Error(`nc-sorter: item "${it.text}" has an unknown bin`);
  }
  return c;
}
