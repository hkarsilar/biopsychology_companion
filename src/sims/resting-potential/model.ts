/**
 * Ion tug-of-war: one kind of ion crosses a membrane through its own channels.
 *
 * The bulk concentrations on both sides stay fixed, because only a tiny fraction of the ions
 * ever needs to cross (see ionsToCharge). Every ion that crosses leaves its charge in a thin
 * layer at the membrane, and that separated charge is the voltage.
 *
 * Crossing rates follow a symmetric energy barrier (Eyring): the outward rate grows with the
 * inside concentration and the inward rate with the outside one, each tilted by the voltage.
 * The net flow stops exactly when the voltage equals the Nernst potential.
 */

import { IONS, nernst, rtf, type IonId } from './ions';

export interface TugOptions {
  ion?: IonId;
  cIn?: number;
  cOut?: number;
  tempC?: number;
}

/** Each drawn ion that crosses changes the voltage by this much. */
export const MV_PER_ION = 3;
/** Crossings per second, for the stronger direction, when there is no voltage yet. */
export const START_RATE = 10;

export type Crossing = 'out' | 'in';

export class TugModel {
  ion: IonId;
  cIn: number;
  cOut: number;
  tempC: number;
  /** Net ions moved from inside to outside (negative = moved in) */
  crossed = 0;
  /** Smooth "mean" version of crossed, for tests and still frames */
  crossedMean = 0;
  open = false;
  t = 0;
  totalOut = 0;
  totalIn = 0;

  constructor(opts: TugOptions = {}) {
    this.ion = opts.ion ?? 'k';
    this.cIn = opts.cIn ?? IONS[this.ion].cIn;
    this.cOut = opts.cOut ?? IONS[this.ion].cOut;
    this.tempC = opts.tempC ?? 37;
  }

  get z(): number {
    return IONS[this.ion].z;
  }

  /** Voltage made by the charge that has crossed: inside relative to outside, mV. */
  V(): number {
    return -this.z * this.crossed * MV_PER_ION + 0;
  }

  Vmean(): number {
    return -this.z * this.crossedMean * MV_PER_ION + 0;
  }

  nernst(): number {
    return nernst(this.z, this.cIn, this.cOut, this.tempC);
  }

  /** Crossing rates per second at voltage V. */
  rates(V = this.V()): { out: number; in: number } {
    if (!this.open) return { out: 0, in: 0 };
    const base = START_RATE / Math.max(this.cIn, this.cOut);
    const u = V / rtf(this.tempC);
    return {
      out: base * this.cIn * Math.exp((this.z * u) / 2),
      in: base * this.cOut * Math.exp((-this.z * u) / 2),
    };
  }

  /**
   * Advance by dt seconds with random crossings. `rand` returns numbers in [0, 1).
   * Returns the crossings that happened, in order.
   */
  step(dt: number, rand: () => number = Math.random): Crossing[] {
    const events: Crossing[] = [];
    // Small sub-steps keep at most about one crossing per sub-step.
    const sub = Math.max(1, Math.ceil(dt / 0.02));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      const r = this.rates();
      const total = r.out + r.in;
      if (total > 0 && rand() < 1 - Math.exp(-total * h)) {
        const dir: Crossing = rand() * total < r.out ? 'out' : 'in';
        this.crossed += dir === 'out' ? 1 : -1;
        if (dir === 'out') this.totalOut++;
        else this.totalIn++;
        events.push(dir);
      }
      this.stepMean(h);
    }
    this.t += dt;
    return events;
  }

  /** Advance the average behaviour (no randomness) by dt seconds. */
  stepMean(dt: number): void {
    const sub = Math.max(1, Math.ceil(dt / 0.01));
    const h = dt / sub;
    for (let k = 0; k < sub; k++) {
      const r = this.rates(this.Vmean());
      this.crossedMean += (r.out - r.in) * h;
    }
  }

  /** Net crossings needed to reach equilibrium. */
  equilibriumCrossed(): number {
    return -this.nernst() / (this.z * MV_PER_ION);
  }

  reset(): void {
    this.crossed = 0;
    this.crossedMean = 0;
    this.t = 0;
    this.totalIn = 0;
    this.totalOut = 0;
  }
}
