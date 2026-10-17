/**
 * The "live neuron" on the home page: a Hodgkin–Huxley cell body that receives synaptic
 * inputs. Each input is a small current that rises fast and decays over a few milliseconds
 * (a difference of two exponentials). One excitatory input is always too weak to fire the
 * cell; two or three that arrive close together add up (summation) and cross threshold.
 * Inhibitory inputs push the other way.
 *
 * Units follow ../action-potential/model.ts: mV, ms, µA/cm².
 */
import { defaultParams, restingState, step, type HHParams, type HHState } from '../action-potential/model';

/** Integration step (ms). */
export const DT = 0.025;
/** Synaptic current rise and decay time constants (ms). */
export const TAU_RISE = 0.5;
export const TAU_DECAY = 4;

const T_PEAK = ((TAU_RISE * TAU_DECAY) / (TAU_DECAY - TAU_RISE)) * Math.log(TAU_DECAY / TAU_RISE);
/** Scales the double exponential so an input of amplitude A peaks at exactly A. */
export const PEAK_NORM = 1 / (Math.exp(-T_PEAK / TAU_DECAY) - Math.exp(-T_PEAK / TAU_RISE));

/**
 * Peak current of one excitatory input made right at the cell body (µA/cm²).
 * About 83% of what a single input would need to fire the cell, so one is never enough.
 */
export const EXC_AMP = 2.4;
/** Peak outward current of the inhibitory synapse on the cell body. */
export const INH_AMP = 3.4;
/** Peak current of a faint spontaneous input (background "chatter"). */
export const SPONT_AMP = 0.3;
/** Voltage the cell must reach before it fires, for these inputs (mV, approximate). */
export const THRESHOLD_MV = -55;

/**
 * How much of an input survives the trip along the dendrite to the cell body.
 * `fraction` is the input's path length divided by the longest path in the tree (0 to 1).
 */
export function attenuation(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  return 0.96 - 0.24 * f;
}

/** Time (ms) an input takes to travel from its synapse to the cell body. */
export function travelDelay(fraction: number): number {
  const f = Math.min(1, Math.max(0, fraction));
  return 0.35 + 1.0 * f;
}

export type InputKind = 'exc' | 'inh';

export interface SomaInput {
  /** Time the input reaches the cell body (ms, simulation clock) */
  t: number;
  /** Peak current, positive for excitation and negative for inhibition (µA/cm²) */
  amp: number;
  kind: InputKind;
  spontaneous?: boolean;
}

export interface SomaEvents {
  onArrival?: (input: SomaInput) => void;
  /** Called when the voltage crosses 0 mV on the way up */
  onSpike?: (t: number) => void;
}

/** A Hodgkin–Huxley cell body with a queue of synaptic inputs. */
export class Soma {
  s: HHState;
  readonly p: HHParams;
  readonly restV: number;
  private xd = 0;
  private xr = 0;
  private queue: SomaInput[] = [];
  private decayD = Math.exp(-DT / TAU_DECAY);
  private decayR = Math.exp(-DT / TAU_RISE);

  constructor(p: HHParams = defaultParams) {
    this.p = p;
    this.s = restingState(p);
    this.restV = this.s.V;
  }

  get t(): number {
    return this.s.t;
  }

  get V(): number {
    return this.s.V;
  }

  /** Synaptic current flowing into the cell right now (µA/cm²). */
  get current(): number {
    return this.xd - this.xr;
  }

  get pending(): number {
    return this.queue.length;
  }

  schedule(input: SomaInput): void {
    this.queue.push(input);
    this.queue.sort((a, b) => a.t - b.t);
  }

  /** Advance the simulation by `ms` milliseconds. */
  advance(ms: number, events: SomaEvents = {}): void {
    const steps = Math.max(0, Math.round(ms / DT));
    for (let i = 0; i < steps; i++) {
      while (this.queue.length && this.queue[0].t <= this.s.t) {
        const input = this.queue.shift()!;
        this.xd += input.amp * PEAK_NORM;
        this.xr += input.amp * PEAK_NORM;
        events.onArrival?.(input);
      }
      const before = this.s.V;
      this.s = step(this.s, this.xd - this.xr, DT, this.p);
      this.xd *= this.decayD;
      this.xr *= this.decayR;
      if (before < 0 && this.s.V >= 0) events.onSpike?.(this.s.t);
    }
  }

  /** True when nothing is happening: at rest, no current, nothing on its way. */
  quiet(tolerance = 0.05): boolean {
    return (
      !this.queue.length &&
      Math.abs(this.s.V - this.restV) < tolerance &&
      Math.abs(this.current) < 1e-3 &&
      Math.abs(this.s.h - 0.596) < 0.01
    );
  }

  reset(): void {
    this.s = restingState(this.p);
    this.xd = 0;
    this.xr = 0;
    this.queue = [];
  }
}
