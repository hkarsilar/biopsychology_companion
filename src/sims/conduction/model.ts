/**
 * Conduction along an axon: a compartmental cable model with Hodgkin–Huxley channels.
 *
 * The axon is cut into short compartments. Each one is a little patch of membrane (a capacitor
 * with channels), joined to its neighbours by the resistance of the axon's inside. Current that
 * flows in at a firing patch spreads along the inside and charges the next patches, which then
 * fire in turn. Speed differences and conduction block come out of the physics, not out of a
 * speed table.
 *
 * Myelinated axons have tiny excitable nodes of Ranvier between long internodes. Myelin is
 * modelled as a passive membrane with very low capacitance and conductance. Damaging the myelin
 * raises both towards the values of bare membrane.
 *
 * Units: voltage mV, time ms, length µm (converted to cm inside), conductance density mS/cm²,
 * capacitance µF/cm², axial resistivity Ω·cm, current µA.
 */

import { rates } from '../action-potential/model';

export interface AxonSpec {
  id: string;
  /** Name shown in the race */
  label: string;
  /** Short name for narrow screens */
  short: string;
  /** Diameter of the axon itself, µm */
  d: number;
  myelinated: boolean;
  /** Has a stretch of myelin that the damage slider strips away */
  damaged?: boolean;
}

export const AXONS: Record<string, AxonSpec> = {
  thin: { id: 'thin', label: 'Thin bare axon (1 µm)', short: 'Thin, 1 µm', d: 1, myelinated: false },
  thick: { id: 'thick', label: 'Thicker bare axon (10 µm)', short: 'Thick, 10 µm', d: 10, myelinated: false },
  squid: { id: 'squid', label: 'Squid giant axon (500 µm)', short: 'Squid, 500 µm', d: 500, myelinated: false },
  myelinated: { id: 'myelinated', label: 'Myelinated axon (10 µm)', short: 'Myelin, 10 µm', d: 10, myelinated: true },
  'myelinated-thin': { id: 'myelinated-thin', label: 'Thin myelinated axon (2 µm)', short: 'Myelin, 2 µm', d: 2, myelinated: true },
  damaged: { id: 'damaged', label: 'Myelinated axon with damaged myelin (10 µm)', short: 'Damaged, 10 µm', d: 10, myelinated: true, damaged: true },
};

/** Squid-axon membrane values from Hodgkin and Huxley (1952). */
export const MEMBRANE = {
  cm: 1,
  gNa: 120,
  gK: 36,
  gL: 0.3,
  ENa: 50,
  EK: -77,
  EL: -54.387,
  /** Axial resistivity of axoplasm, Ω·cm */
  Ri: 35.4,
};

/** Hodgkin and Huxley computed their famous conducted spike at 18.5 °C. */
export const TEMP_C = 18.5;
/** Channel kinetics speed up about threefold for every 10 °C (Q10 = 3). */
export const PHI = 3 ** ((TEMP_C - 6.3) / 10);

export const MYELIN = {
  /** Internode length as a multiple of axon diameter (real fibres: about 100×) */
  internodePerD: 100,
  /** Length of a node of Ranvier, µm */
  nodeLength: 1,
  /** Myelin cuts membrane capacitance and leak by this factor (about 40 wraps of membrane) */
  insulation: 80,
  /** Nodes pack sodium channels far more densely than a squid axon's membrane */
  nodeChannelFactor: 20,
  /** Compartments per internode */
  pieces: 8,
};

export const TRACK_UM = 10_000; // a 1 cm race track

export type StimSite = 'start' | 'middle';

export interface AxonOptions {
  /** Track length, µm */
  length?: number;
  /** 0 = healthy myelin, 1 = myelin gone, applied to the damaged stretch */
  damage?: number;
  /** Damaged stretch as fractions of the track, e.g. [0.35, 0.65] */
  damageRange?: [number, number];
  stim?: StimSite;
}

/** Voltage at which we say the spike has "arrived" at a point. */
export const ARRIVAL_MV = -20;
const STIM_MV = 20;
const STIM_MS = 0.15;
const STIM_UM = 300;

function restGates() {
  const r = rates(-65);
  return {
    m: r.am / (r.am + r.bm),
    h: r.ah / (r.ah + r.bh),
    n: r.an / (r.an + r.bn),
  };
}

/** Length constant of bare resting membrane, µm: how far a steady voltage spreads before fading to 37 %. */
export function lengthConstant(dUm: number): number {
  const rm = 1 / (MEMBRANE.gL * 1e-3 + 0.37e-3); // Ω·cm² at rest, leak plus resting K⁺ (≈1.5 kΩ·cm²)
  const d = dUm * 1e-4;
  return Math.sqrt((rm * d) / (4 * MEMBRANE.Ri)) * 1e4;
}

export class Axon {
  readonly spec: AxonSpec;
  readonly length: number;
  readonly n: number;
  /** Centre of each compartment, µm from the start */
  readonly x: Float64Array;
  readonly len: Float64Array;
  readonly isNode: Uint8Array;
  readonly damaged: Uint8Array;
  readonly V: Float64Array;
  readonly m: Float64Array;
  readonly h: Float64Array;
  readonly n_: Float64Array;
  /** First time each compartment crossed ARRIVAL_MV, ms (NaN until then) */
  readonly arrival: Float64Array;
  t = 0;
  stim: StimSite;
  damage: number;

  // Per-compartment constants
  private area: Float64Array; // cm²
  private cap: Float64Array; // µF
  private gNa: Float64Array; // mS
  private gK: Float64Array;
  private gL: Float64Array;
  private eL: Float64Array;
  private gAx: Float64Array; // mS between i and i+1
  private stimMask: Uint8Array;
  // Work arrays for the tridiagonal solve
  private a: Float64Array;
  private b: Float64Array;
  private c: Float64Array;
  private r: Float64Array;

  constructor(spec: AxonSpec, opts: AxonOptions = {}) {
    this.spec = spec;
    this.length = opts.length ?? TRACK_UM;
    this.stim = opts.stim ?? 'start';
    this.damage = opts.damage ?? 0;
    const range = opts.damageRange ?? [0.35, 0.65];

    // Lay out compartments.
    const xs: number[] = [];
    const ls: number[] = [];
    const nodes: number[] = [];
    if (spec.myelinated) {
      const L = MYELIN.internodePerD * spec.d;
      const piece = L / MYELIN.pieces;
      let pos = 0;
      while (pos < this.length - 1e-6) {
        xs.push(pos + MYELIN.nodeLength / 2);
        ls.push(MYELIN.nodeLength);
        nodes.push(1);
        pos += MYELIN.nodeLength;
        for (let k = 0; k < MYELIN.pieces && pos < this.length - 1e-6; k++) {
          const l = Math.min(piece, this.length - pos);
          xs.push(pos + l / 2);
          ls.push(l);
          nodes.push(0);
          pos += l;
        }
      }
      // End on a node so the far end is excitable.
      if (!nodes[nodes.length - 1]) {
        xs.push(pos + MYELIN.nodeLength / 2);
        ls.push(MYELIN.nodeLength);
        nodes.push(1);
      }
    } else {
      const dx = Math.min(250, Math.max(10, lengthConstant(spec.d) / 16));
      const count = Math.ceil(this.length / dx);
      const l = this.length / count;
      for (let i = 0; i < count; i++) {
        xs.push((i + 0.5) * l);
        ls.push(l);
        nodes.push(1);
      }
    }
    this.n = xs.length;
    const N = this.n;
    this.x = Float64Array.from(xs);
    this.len = Float64Array.from(ls);
    this.isNode = Uint8Array.from(nodes);
    this.damaged = new Uint8Array(N);
    this.V = new Float64Array(N);
    this.m = new Float64Array(N);
    this.h = new Float64Array(N);
    this.n_ = new Float64Array(N);
    this.arrival = new Float64Array(N);
    this.area = new Float64Array(N);
    this.cap = new Float64Array(N);
    this.gNa = new Float64Array(N);
    this.gK = new Float64Array(N);
    this.gL = new Float64Array(N);
    this.eL = new Float64Array(N);
    this.gAx = new Float64Array(N);
    this.stimMask = new Uint8Array(N);
    this.a = new Float64Array(N);
    this.b = new Float64Array(N);
    this.c = new Float64Array(N);
    this.r = new Float64Array(N);

    const dCm = spec.d * 1e-4;
    for (let i = 0; i < N; i++) {
      const lenCm = ls[i] * 1e-4;
      this.area[i] = Math.PI * dCm * lenCm;
      const frac = xs[i] / this.length;
      if (spec.damaged && !nodes[i] && frac >= range[0] && frac <= range[1]) this.damaged[i] = 1;
    }
    for (let i = 0; i < N - 1; i++) {
      // Resistance of the inside between the centres of compartments i and i+1.
      const distCm = ((ls[i] + ls[i + 1]) / 2) * 1e-4;
      const R = (MEMBRANE.Ri * distCm) / ((Math.PI * dCm * dCm) / 4); // Ω
      this.gAx[i] = 1000 / R; // mS
    }
    this.setDamage(this.damage);
    this.reset();
  }

  /** Set how much myelin is lost on the damaged stretch (0 = healthy, 1 = bare). */
  setDamage(f: number): void {
    this.damage = Math.min(1, Math.max(0, f));
    const node = this.spec.myelinated ? MYELIN.nodeChannelFactor : 1;
    for (let i = 0; i < this.n; i++) {
      const A = this.area[i];
      if (this.isNode[i]) {
        this.cap[i] = MEMBRANE.cm * A;
        this.gNa[i] = MEMBRANE.gNa * node * A;
        this.gK[i] = MEMBRANE.gK * node * A;
        this.gL[i] = MEMBRANE.gL * node * A;
        this.eL[i] = MEMBRANE.EL;
      } else {
        // Myelin: wraps of membrane in series divide capacitance and leak.
        const keep = this.damaged[i] ? 1 - this.damage : 1;
        const factor = 1 + (MYELIN.insulation - 1) * keep;
        this.cap[i] = (MEMBRANE.cm * A) / factor;
        this.gNa[i] = 0;
        this.gK[i] = 0;
        // Passive membrane leak, set to rest at −65 mV.
        this.gL[i] = ((MEMBRANE.gL + 0.37) * A) / factor;
        this.eL[i] = -65;
      }
    }
  }

  /** Back to rest, ready for a new race. */
  reset(): void {
    const g = restGates();
    this.V.fill(-65);
    this.m.fill(g.m);
    this.h.fill(g.h);
    this.n_.fill(g.n);
    this.arrival.fill(NaN);
    this.t = 0;
    this.stimMask.fill(0);
    const mid = this.length / 2;
    for (let i = 0; i < this.n; i++) {
      const x = this.x[i];
      if (this.stim === 'start' && x <= STIM_UM) this.stimMask[i] = 1;
      if (this.stim === 'middle' && Math.abs(x - mid) <= STIM_UM / 2) this.stimMask[i] = 1;
    }
  }

  /** Advance by dt ms: gates by exponential Euler, voltage by backward Euler (stable for any dt). */
  step(dt: number): void {
    const N = this.n;
    const { V, m, h } = this;
    const nn = this.n_;
    const stimOn = this.t < STIM_MS;
    for (let i = 0; i < N; i++) {
      if (this.gNa[i] > 0) {
        const r = rates(V[i]);
        const sm = PHI * (r.am + r.bm);
        const sh = PHI * (r.ah + r.bh);
        const sn = PHI * (r.an + r.bn);
        m[i] = r.am / (r.am + r.bm) + (m[i] - r.am / (r.am + r.bm)) * Math.exp(-dt * sm);
        h[i] = r.ah / (r.ah + r.bh) + (h[i] - r.ah / (r.ah + r.bh)) * Math.exp(-dt * sh);
        nn[i] = r.an / (r.an + r.bn) + (nn[i] - r.an / (r.an + r.bn)) * Math.exp(-dt * sn);
      }
    }
    const { a, b, c, r } = this;
    for (let i = 0; i < N; i++) {
      if (stimOn && this.stimMask[i]) {
        // The stimulating electrode holds this stretch at +20 mV for a moment.
        a[i] = 0;
        c[i] = 0;
        b[i] = 1;
        r[i] = STIM_MV;
        continue;
      }
      const gna = this.gNa[i] * m[i] * m[i] * m[i] * h[i];
      const n2 = nn[i] * nn[i];
      const gk = this.gK[i] * n2 * n2;
      const gl = this.gL[i];
      const cdt = this.cap[i] / dt;
      const left = i > 0 ? this.gAx[i - 1] : 0;
      const right = i < N - 1 ? this.gAx[i] : 0;
      a[i] = -left;
      c[i] = -right;
      b[i] = cdt + gna + gk + gl + left + right;
      r[i] = cdt * V[i] + gna * MEMBRANE.ENa + gk * MEMBRANE.EK + gl * this.eL[i];
    }
    // Thomas algorithm for the tridiagonal system.
    for (let i = 1; i < N; i++) {
      const w = a[i] / b[i - 1];
      b[i] -= w * c[i - 1];
      r[i] -= w * r[i - 1];
    }
    const prev = this.r; // reuse r as output buffer after back-substitution
    const t1 = this.t + dt;
    let vNext = r[N - 1] / b[N - 1];
    this.updateV(N - 1, vNext, t1);
    for (let i = N - 2; i >= 0; i--) {
      vNext = (prev[i] - c[i] * V[i + 1]) / b[i];
      this.updateV(i, vNext, t1);
    }
    this.t = t1;
  }

  private updateV(i: number, v: number, t: number): void {
    const before = this.V[i];
    this.V[i] = v;
    if (before < ARRIVAL_MV && v >= ARRIVAL_MV && Number.isNaN(this.arrival[i]) && !this.stimMask[i]) {
      // Interpolate the crossing time within the step.
      this.arrival[i] = t;
    }
  }

  /** Run until `ms` of model time have passed. */
  run(ms: number, dt = DT): void {
    const end = this.t + ms - 1e-9;
    while (this.t < end) this.step(dt);
  }

  /** Index of the compartment nearest position x (µm). */
  indexAt(x: number): number {
    let lo = 0;
    let hi = this.n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.x[mid] < x) lo = mid;
      else hi = mid;
    }
    return Math.abs(this.x[lo] - x) <= Math.abs(this.x[hi] - x) ? lo : hi;
  }

  /** First arrival time at or beyond position x (µm), counting only excitable compartments. */
  arrivalAt(x: number): number {
    for (let i = this.indexAt(x); i < this.n; i++) {
      if (this.isNode[i]) return this.arrival[i];
    }
    return NaN;
  }

  /** Conduction speed in m/s, measured between 25 % and 75 % of the track (µm/ms = mm/s → m/s ÷ 1000). */
  speed(): number {
    if (this.stim !== 'start') return NaN;
    const x1 = this.length * 0.25;
    const x2 = this.length * 0.75;
    const t1 = this.arrivalAt(x1);
    const t2 = this.arrivalAt(x2);
    if (!(t2 > t1)) return NaN;
    return (this.x[this.indexAtNodeFrom(x2)] - this.x[this.indexAtNodeFrom(x1)]) / (t2 - t1) / 1000;
  }

  private indexAtNodeFrom(x: number): number {
    for (let i = this.indexAt(x); i < this.n; i++) if (this.isNode[i]) return i;
    return this.n - 1;
  }

  /** Time the spike reached the far end of the track, ms (NaN if it has not, or never will). */
  finishTime(): number {
    if (this.stim !== 'start') return NaN;
    return this.arrival[this.n - 1];
  }

  /** How far the spike has got, µm (the furthest compartment that has fired). */
  front(): number {
    let best = -1;
    for (let i = 0; i < this.n; i++) if (!Number.isNaN(this.arrival[i]) && this.x[i] > best) best = this.x[i];
    return best;
  }

  /** True once the spike has clearly died out before reaching the end. */
  blocked(): boolean {
    if (!Number.isNaN(this.finishTime())) return false;
    // Nothing is depolarised any more, and the spike has had time to start.
    if (this.t < 1) return false;
    for (let i = 0; i < this.n; i++) if (this.V[i] > -50) return false;
    return true;
  }

  /** The highest voltage anywhere: used to tell when all activity has died down. */
  maxV(): number {
    let mx = -Infinity;
    for (let i = 0; i < this.n; i++) if (this.V[i] > mx) mx = this.V[i];
    return mx;
  }
}

export const DT = 0.005;

/** Run one axon from the start of the track until the spike finishes or fails. Returns speed and finish. */
export function race(spec: AxonSpec, opts: AxonOptions = {}, maxMs = 40) {
  const ax = new Axon(spec, opts);
  while (ax.t < maxMs) {
    ax.run(0.25);
    if (!Number.isNaN(ax.finishTime()) || ax.blocked()) break;
  }
  return { axon: ax, speed: ax.speed(), finish: ax.finishTime(), blocked: Number.isNaN(ax.finishTime()) };
}
