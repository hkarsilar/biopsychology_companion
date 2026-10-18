/**
 * Hodgkin–Huxley model of a patch of squid giant axon membrane (6.3 °C), in the modern
 * sign convention: rest ≈ −65 mV, inside relative to outside.
 *
 * Units: voltage mV, time ms, current µA/cm², conductance mS/cm², capacitance µF/cm².
 * Hodgkin & Huxley (1952), J Physiol 117:500–544.
 */

export interface HHParams {
  C: number;
  gNa: number;
  gK: number;
  gL: number;
  ENa: number;
  EK: number;
  EL: number;
  /** Fraction of Na+ channels blocked (TTX), 0–1 */
  naBlock: number;
  /**
   * Fraction of voltage-gated K+ channels blocked (TEA), 0–1. The resting K+ conductance
   * is left alone, because in a real axon that comes from separate leak channels; blocking
   * it too would make the model fire on its own, which TEA does not do.
   */
  kBlock: number;
  /**
   * Slows Na+ inactivation (h gate) by this factor, 1 = normal.
   * Sea anemone toxins such as ATX-II have this effect.
   */
  inactivationSlowing: number;
}

export interface HHState {
  t: number;
  V: number;
  m: number;
  h: number;
  n: number;
}

export const defaultParams: HHParams = {
  C: 1,
  gNa: 120,
  gK: 36,
  gL: 0.3,
  ENa: 50,
  EK: -77,
  EL: -54.387,
  naBlock: 0,
  kBlock: 0,
  inactivationSlowing: 1,
};

/** x / (1 − e^(−x/k)), with the removable singularity at x = 0 handled. */
function vtrap(x: number, k: number): number {
  return Math.abs(x / k) < 1e-6 ? k * (1 + x / k / 2) : x / (1 - Math.exp(-x / k));
}

export function rates(V: number) {
  const am = 0.1 * vtrap(V + 40, 10);
  const bm = 4 * Math.exp(-(V + 65) / 18);
  const ah = 0.07 * Math.exp(-(V + 65) / 20);
  const bh = 1 / (1 + Math.exp(-(V + 35) / 10));
  const an = 0.01 * vtrap(V + 55, 10);
  const bn = 0.125 * Math.exp(-(V + 65) / 80);
  return { am, bm, ah, bh, an, bn };
}

/** Steady-state gate values at a fixed voltage. */
export function steadyGates(V: number) {
  const r = rates(V);
  return {
    m: r.am / (r.am + r.bm),
    h: r.ah / (r.ah + r.bh),
    n: r.an / (r.an + r.bn),
  };
}

/** n⁴ at rest (−65 mV): the part of gK that TEA leaves alone. */
const N4_REST = steadyGates(-65).n ** 4;

function gKOf(n4: number, p: HHParams): number {
  return p.gK * ((1 - p.kBlock) * n4 + p.kBlock * Math.min(n4, N4_REST));
}

export function conductances(s: HHState, p: HHParams) {
  const gNa = p.gNa * (1 - p.naBlock) * s.m ** 3 * s.h;
  const gK = gKOf(s.n ** 4, p);
  return { gNa, gK, gL: p.gL };
}

/** Ionic currents, positive = outward (the HH convention). */
export function currents(s: HHState, p: HHParams) {
  const g = conductances(s, p);
  return {
    INa: g.gNa * (s.V - p.ENa),
    IK: g.gK * (s.V - p.EK),
    IL: g.gL * (s.V - p.EL),
  };
}

type Deriv = { V: number; m: number; h: number; n: number };

function derivatives(V: number, m: number, h: number, n: number, Iext: number, p: HHParams): Deriv {
  const r = rates(V);
  const slow = Math.max(p.inactivationSlowing, 1e-3);
  const gNa = p.gNa * (1 - p.naBlock) * m * m * m * h;
  const gK = gKOf(n * n * n * n, p);
  const Iion = gNa * (V - p.ENa) + gK * (V - p.EK) + p.gL * (V - p.EL);
  return {
    V: (Iext - Iion) / p.C,
    m: r.am * (1 - m) - r.bm * m,
    h: (r.ah * (1 - h) - r.bh * h) / slow,
    n: r.an * (1 - n) - r.bn * n,
  };
}

/** Advance the state by dt (ms) with a fourth-order Runge–Kutta step. */
export function step(s: HHState, Iext: number, dt: number, p: HHParams): HHState {
  const k1 = derivatives(s.V, s.m, s.h, s.n, Iext, p);
  const k2 = derivatives(
    s.V + (dt / 2) * k1.V,
    s.m + (dt / 2) * k1.m,
    s.h + (dt / 2) * k1.h,
    s.n + (dt / 2) * k1.n,
    Iext,
    p,
  );
  const k3 = derivatives(
    s.V + (dt / 2) * k2.V,
    s.m + (dt / 2) * k2.m,
    s.h + (dt / 2) * k2.h,
    s.n + (dt / 2) * k2.n,
    Iext,
    p,
  );
  const k4 = derivatives(s.V + dt * k3.V, s.m + dt * k3.m, s.h + dt * k3.h, s.n + dt * k3.n, Iext, p);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return {
    t: s.t + dt,
    V: s.V + (dt / 6) * (k1.V + 2 * k2.V + 2 * k3.V + k4.V),
    m: clamp(s.m + (dt / 6) * (k1.m + 2 * k2.m + 2 * k3.m + k4.m)),
    h: clamp(s.h + (dt / 6) * (k1.h + 2 * k2.h + 2 * k3.h + k4.h)),
    n: clamp(s.n + (dt / 6) * (k1.n + 2 * k2.n + 2 * k3.n + k4.n)),
  };
}

/** The state the membrane settles into with no stimulus. */
export function restingState(p: HHParams = defaultParams): HHState {
  const V0 = -65;
  let s: HHState = { t: 0, V: V0, ...steadyGates(V0) };
  for (let i = 0; i < 4000; i++) s = step(s, 0, 0.025, p);
  return { ...s, t: 0 };
}

/** A rectangular current pulse. */
export interface Pulse {
  start: number;
  duration: number;
  amplitude: number;
}

export function stimulusAt(t: number, pulses: Pulse[], hold = 0): number {
  let I = hold;
  for (const q of pulses) if (t >= q.start && t < q.start + q.duration) I += q.amplitude;
  return I;
}

/** Run the model for `duration` ms and return sampled traces (for tests and previews). */
export function simulate(
  duration: number,
  pulses: Pulse[],
  p: HHParams = defaultParams,
  opts: { dt?: number; hold?: number; start?: HHState } = {},
) {
  const dt = opts.dt ?? 0.01;
  let s = opts.start ?? restingState(p);
  const t0 = s.t;
  const out: HHState[] = [s];
  const steps = Math.round(duration / dt);
  for (let i = 0; i < steps; i++) {
    s = step(s, stimulusAt(s.t - t0, pulses, opts.hold ?? 0), dt, p);
    out.push(s);
  }
  return out;
}

/** Count upward crossings of 0 mV: one per action potential. */
export function countSpikes(trace: HHState[], level = 0): number {
  let count = 0;
  for (let i = 1; i < trace.length; i++) if (trace[i - 1].V < level && trace[i].V >= level) count++;
  return count;
}

/**
 * Sodium ions that entered per µm² of membrane over a trace.
 * Charge (nC/cm²) = −∫ I_Na dt with I_Na in µA/cm² and t in ms; 1 cm² = 10⁸ µm²; e = 1.602e−19 C.
 */
export function sodiumIonsPerUm2(trace: HHState[], p: HHParams = defaultParams): number {
  // Count only the extra entry above the small, steady sodium leak at rest.
  const restINa = currents(restingState(p), p).INa;
  let charge = 0; // nC/cm²
  for (let i = 1; i < trace.length; i++) {
    const dt = trace[i].t - trace[i - 1].t;
    const extra = restINa - currents(trace[i], p).INa; // positive = extra inward
    if (extra > 0) charge += extra * dt;
  }
  return ionsFromCharge(charge);
}

/**
 * Fractional change in internal Na⁺ for a squid giant axon (diameter 500 µm, [Na⁺]in 50 mM)
 * if `ionsPerUm2` entered through every µm² of its membrane.
 */
export function squidInternalNaChange(ionsPerUm2: number): number {
  const radiusUm = 250;
  const litresPerUm2 = (radiusUm / 2) * 1e-15; // volume per area of a cylinder = r/2; 1 µm³ = 1e-15 L
  const ionsInside = 0.05 * litresPerUm2 * 6.022e23;
  return ionsPerUm2 / ionsInside;
}

/** Convert charge in nC/cm² to monovalent ions per µm². */
export function ionsFromCharge(chargeNcPerCm2: number): number {
  return (chargeNcPerCm2 * 1e-9) / 1.602e-19 / 1e8;
}

/** A plain-language name for what the membrane is doing right now. */
export type Phase = 'rest' | 'stimulus' | 'rising' | 'falling' | 'undershoot' | 'refractory' | 'depolarised';

export function describePhase(s: HHState, dVdt: number, stimulusOn: boolean, p: HHParams): Phase {
  const restV = -65;
  if (dVdt > 4 && s.V > -55) return 'rising';
  if (dVdt < -4 && s.V > -62) return 'falling';
  if (s.V < restV - 2) return 'undershoot';
  if (s.V > -40 && Math.abs(dVdt) <= 4) return 'depolarised';
  if (stimulusOn) return 'stimulus';
  if (s.h < 0.45 && p.naBlock < 1) return 'refractory';
  return 'rest';
}

export const phaseText: Record<Phase, string> = {
  rest: 'At rest: most sodium channels are closed but ready; a few potassium channels leak.',
  stimulus: 'The stimulus pushes positive charge in and the membrane depolarises.',
  rising: 'Rising phase: sodium channels fly open and Na⁺ rushes in, so the inside turns positive.',
  falling: 'Falling phase: sodium channels inactivate while potassium channels open and K⁺ flows out.',
  undershoot: 'Undershoot: slow potassium channels are still open, so the inside dips below rest.',
  refractory: 'Refractory: many sodium channels are still inactivated, so a new spike is hard to start.',
  depolarised: 'Stuck depolarised: the membrane is not returning to rest normally.',
};
