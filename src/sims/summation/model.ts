/**
 * Summation at the axon hillock: a leaky integrate-and-fire neuron with synapses at
 * different distances along its dendrites.
 *
 * Each excitatory input injects a fixed amount of charge at its synapse. On the way to the
 * hillock it shrinks with distance (attenuation e^(−x/λ), where λ is the length constant)
 * and it arrives later and more spread out in time. Inhibitory inputs open chloride
 * channels: a conductance that pulls the voltage towards E_Cl and, near the cell body,
 * shunts away the current from excitatory inputs.
 *
 * The hillock voltage obeys   dV/dt = −(V − V_rest)/τ_m + I_exc(t) − g_inh(t)·(V − E_Cl),
 * and fires a spike when it reaches threshold.
 *
 * Units: time ms, voltage mV, distance µm.
 */

export type InputKind = 'exc' | 'inh';

export interface SumParams {
  /** Membrane time constant (ms) */
  tauM: number;
  /** Length constant of the dendrites (µm) */
  lambda: number;
}

export const defaultSumParams: SumParams = { tauM: 15, lambda: 300 };

export const SUM = {
  vRest: -70,
  threshold: -55,
  eCl: -80,
  spikePeak: 30,
  reset: -75,
  refractory: 3,
  /** Charge of one excitatory input, as mV of depolarisation it would cause at the soma */
  qExc: 16.6,
  /** Integrated conductance of one inhibitory input at the soma (relative to the leak, × ms) */
  gInh: 2.4,
  excRise: 0.5,
  excDecay: 2,
  inhRise: 0.6,
  inhDecay: 7,
  /** Extra rise time and spread per length constant of distance (ms) */
  spreadPerLambda: 2.2,
  /** Travel delay per length constant of distance (ms) */
  delayPerLambda: 1.6,
  dt: 0.02,
};

/** How much of an input survives the trip from its synapse to the hillock. */
export function attenuation(distance: number, lambda: number): number {
  return Math.exp(-Math.max(0, distance) / lambda);
}

export function travelDelay(distance: number, lambda: number): number {
  return SUM.delayPerLambda * (Math.max(0, distance) / lambda);
}

/** A double-exponential kernel with unit area. */
export function kernel(s: number, rise: number, decay: number): number {
  if (s <= 0) return 0;
  return (Math.exp(-s / decay) - Math.exp(-s / rise)) / (decay - rise);
}

export interface ScheduledInput {
  id: number;
  /** Which synapse slot it came from (for drawing) */
  site: number;
  kind: InputKind;
  distance: number;
  /** Time the input is triggered at the synapse */
  t: number;
  /** Time it starts to reach the hillock */
  arrive: number;
  weight: number;
  rise: number;
  decay: number;
  /** Its own PSP at the hillock, as if it were alone (for drawing contributions) */
  alone: number;
}

export interface SumEvent {
  type: 'spike' | 'arrive';
  t: number;
  input?: ScheduledInput;
}

export class SummationModel {
  t = 0;
  v = SUM.vRest;
  params: SumParams;
  inputs: ScheduledInput[] = [];
  spikes: number[] = [];
  private refractoryUntil = -Infinity;
  private nextId = 1;

  constructor(params: SumParams = defaultSumParams) {
    this.params = { ...params };
  }

  reset(): void {
    this.t = 0;
    this.v = SUM.vRest;
    this.inputs = [];
    this.spikes = [];
    this.refractoryUntil = -Infinity;
  }

  /** Trigger a synapse at `distance` µm from the soma, now or at time `t`. */
  trigger(site: number, distance: number, kind: InputKind, t = this.t): ScheduledInput {
    const { lambda } = this.params;
    const spread = SUM.spreadPerLambda * (distance / lambda);
    const input: ScheduledInput = {
      id: this.nextId++,
      site,
      kind,
      distance,
      t,
      arrive: t + travelDelay(distance, lambda),
      weight: attenuation(distance, lambda),
      rise: (kind === 'exc' ? SUM.excRise : SUM.inhRise) + spread * 0.5,
      decay: (kind === 'exc' ? SUM.excDecay : SUM.inhDecay) + spread,
      alone: 0,
    };
    this.inputs.push(input);
    return input;
  }

  /** Excitatory drive (mV/ms) and inhibitory conductance (per ms) at time t. */
  drive(t: number): { exc: number; inh: number } {
    let exc = 0;
    let inh = 0;
    for (const i of this.inputs) {
      const k = kernel(t - i.arrive, i.rise, i.decay);
      if (!k) continue;
      if (i.kind === 'exc') exc += SUM.qExc * i.weight * k;
      else inh += SUM.gInh * i.weight * k;
    }
    return { exc, inh };
  }

  /** Advance by `ms`. Returns spikes and arrivals that happened. */
  advance(ms: number): SumEvent[] {
    const events: SumEvent[] = [];
    const n = Math.max(1, Math.round(ms / SUM.dt));
    const dt = ms / n;
    for (let k = 0; k < n; k++) {
      const t0 = this.t;
      const t1 = t0 + dt;
      for (const i of this.inputs) if (i.arrive > t0 && i.arrive <= t1) events.push({ type: 'arrive', t: i.arrive, input: i });
      const { exc, inh } = this.drive(t1);
      // Each input's PSP on its own, from rest, for drawing.
      for (const i of this.inputs) {
        const kk = kernel(t1 - i.arrive, i.rise, i.decay);
        const leak = -i.alone / this.params.tauM;
        const push = i.kind === 'exc' ? SUM.qExc * i.weight * kk : -SUM.gInh * i.weight * kk * (SUM.vRest + i.alone - SUM.eCl);
        i.alone += (leak + push) * dt;
      }
      if (t1 < this.refractoryUntil) {
        this.v = SUM.reset;
      } else {
        this.v += (-(this.v - SUM.vRest) / this.params.tauM + exc - inh * (this.v - SUM.eCl)) * dt;
        if (this.v >= SUM.threshold) {
          this.spikes.push(t1);
          events.push({ type: 'spike', t: t1 });
          this.refractoryUntil = t1 + SUM.refractory;
          this.v = SUM.reset;
        }
      }
      this.t = t1;
    }
    // Forget inputs whose effect has faded.
    this.inputs = this.inputs.filter((i) => this.t - i.arrive < 8 * i.decay + 5 * this.params.tauM || Math.abs(i.alone) > 0.02);
    return events;
  }

  /** True while some input is still affecting the hillock. */
  active(): boolean {
    return this.inputs.length > 0 || Math.abs(this.v - SUM.vRest) > 0.05 || this.t < this.refractoryUntil;
  }
}

export interface PlannedInput {
  site: number;
  distance: number;
  kind: InputKind;
  t: number;
}

/** Run a fixed set of inputs and report the spikes and the highest voltage reached. */
export function simulate(inputs: PlannedInput[], params: SumParams = defaultSumParams, duration = 120) {
  const m = new SummationModel(params);
  for (const i of inputs) m.trigger(i.site, i.distance, i.kind, i.t);
  let peak = -Infinity;
  let trough = Infinity;
  while (m.t < duration) {
    m.advance(0.1);
    if (m.spikes.length === 0) peak = Math.max(peak, m.v);
    trough = Math.min(trough, m.v);
  }
  return { spikes: m.spikes.length, firstSpike: m.spikes[0] ?? null, peak, trough };
}

/**
 * The schedule used by the "Fire" button: every placed synapse fires together in each
 * round, and rounds repeat `repeats` times, `gap` ms apart.
 */
export function pattern(sites: { site: number; distance: number; kind: InputKind }[], repeats: number, gap: number, start = 0): PlannedInput[] {
  const out: PlannedInput[] = [];
  for (let r = 0; r < repeats; r++) for (const s of sites) out.push({ ...s, t: start + r * gap });
  return out;
}
