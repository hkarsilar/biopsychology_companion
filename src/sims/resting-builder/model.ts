/**
 * Resting potential builder: the Goldman–Hodgkin–Katz (GHK) voltage equation.
 *
 * Several kinds of ion leak through the membrane at once. Each one pulls the voltage towards
 * its own Nernst potential, and how hard it pulls depends on how easily it crosses
 * (its permeability) and how much of it there is. The membrane settles where the pulls balance.
 *
 * The Na⁺/K⁺ pump swaps 3 Na⁺ out for 2 K⁺ in. That makes it slightly electrogenic (a few mV),
 * but its main job is to keep the concentrations from running down. With the pump off,
 * this model lets the concentrations leak away over (simulated) hours.
 */

import { IONS, ION_ORDER, nernst, rtf, type IonId } from '../resting-potential/ions';

export type Perms = Record<IonId, number>;
export type Concs = Record<IonId, { in: number; out: number }>;

export interface BuilderState {
  P: Perms;
  C: Concs;
  tempC: number;
  pump: boolean;
}

export function typicalConcs(): Concs {
  return {
    k: { in: IONS.k.cIn, out: IONS.k.cOut },
    na: { in: IONS.na.cIn, out: IONS.na.cOut },
    cl: { in: IONS.cl.cIn, out: IONS.cl.cOut },
  };
}

/** Pump ratio: 3 Na⁺ out for every 2 K⁺ in. */
export const PUMP_RATIO = 3 / 2;

/**
 * GHK voltage equation. With `pump`, the Mullins–Noda form, in which the pump's 3:2 exchange
 * weights potassium by 3/2 and adds the pump's small direct contribution.
 */
export function ghk(P: Perms, C: Concs, tempC = 37, pump = false): number {
  const r = pump ? PUMP_RATIO : 1;
  const num = r * P.k * C.k.out + P.na * C.na.out + P.cl * C.cl.in;
  const den = r * P.k * C.k.in + P.na * C.na.in + P.cl * C.cl.out;
  if (num <= 0 || den <= 0) return NaN;
  return rtf(tempC) * Math.log(num / den);
}

/**
 * Outward GHK particle flux of one ion at voltage V, in units of P × mM.
 * Positive = ions leaving the cell.
 */
export function ghkFlux(ion: IonId, P: number, cIn: number, cOut: number, V: number, tempC = 37): number {
  const z = IONS[ion].z;
  const u = (z * V) / rtf(tempC);
  if (Math.abs(u) < 1e-6) return P * (cIn - cOut);
  return (P * u * (cIn - cOut * Math.exp(-u))) / (1 - Math.exp(-u));
}

/** Electric current carried by one ion (outward positive), in the same relative units. */
function ghkCurrent(ion: IonId, P: number, cIn: number, cOut: number, V: number, tempC: number): number {
  return IONS[ion].z * ghkFlux(ion, P, cIn, cOut, V, tempC);
}

export interface Pull {
  ion: IonId;
  /** Nernst potential, mV */
  E: number;
  /** Share of the total pull, 0–1. The voltage is the pull-weighted average of the E's. */
  share: number;
}

/**
 * How strongly each ion pulls on the voltage at V: its chord conductance, I / (V − E).
 * At the resting voltage the shares weight the Nernst potentials into exactly V.
 */
export function pulls(P: Perms, C: Concs, V: number, tempC = 37): Pull[] {
  const g = ION_ORDER.map((ion) => {
    const E = nernst(IONS[ion].z, C[ion].in, C[ion].out, tempC);
    let chord: number;
    if (P[ion] <= 0) chord = 0;
    else if (Math.abs(V - E) < 1e-4) {
      // Slope at the reversal potential instead of 0/0.
      const h = 0.01;
      chord =
        (ghkCurrent(ion, P[ion], C[ion].in, C[ion].out, E + h, tempC) -
          ghkCurrent(ion, P[ion], C[ion].in, C[ion].out, E - h, tempC)) /
        (2 * h);
    } else chord = ghkCurrent(ion, P[ion], C[ion].in, C[ion].out, V, tempC) / (V - E);
    return { ion, E, chord: Math.max(0, chord) };
  });
  const total = g.reduce((s, x) => s + x.chord, 0) || 1;
  return g.map((x) => ({ ion: x.ion, E: x.E, share: x.chord / total }));
}

/** Map a 0–100 slider position to a permeability (log scale; 70 → 1, 0 → none). */
export function sliderToP(s: number): number {
  if (s <= 0) return 0;
  return 10 ** (-3 + (s / 70) * 3);
}

export function pToSlider(P: number): number {
  if (P <= 0) return 0;
  return Math.min(100, Math.max(0.1, ((Math.log10(P) + 3) / 3) * 70));
}

/**
 * Run-down with the pump off: every ion leaks down its gradient through its permeability,
 * changing the concentrations inside a small cell; the bath outside is large and stays fixed.
 * `hours` of simulated time. RUN_DOWN sets how fast: with typical values the voltage has run
 * halfway down after a few hours, as in a large cell (small cells run down faster).
 */
export const RUN_DOWN = 3;

export function runDown(state: BuilderState, hours: number): Concs {
  const C: Concs = {
    k: { ...state.C.k },
    na: { ...state.C.na },
    cl: { ...state.C.cl },
  };
  const sub = Math.max(1, Math.ceil(hours / 0.01));
  const h = hours / sub;
  for (let s = 0; s < sub; s++) {
    const V = ghk(state.P, C, state.tempC, false);
    if (!Number.isFinite(V)) break;
    for (const ion of ION_ORDER) {
      const J = ghkFlux(ion, state.P[ion], C[ion].in, C[ion].out, V, state.tempC);
      C[ion].in = Math.max(0.01, C[ion].in - RUN_DOWN * J * h);
    }
  }
  return C;
}

/** How fast a running pump wins back gradients that have run down (hours). */
export const PUMP_TAU_H = 0.5;

/**
 * Advance the concentrations inside the cell by `hours`. With the pump off they run down;
 * with the pump on they are pumped back towards `rest`, the values the pump maintains.
 */
export function evolve(state: BuilderState, rest: Concs, hours: number): Concs {
  if (!state.pump) return runDown(state, hours);
  const k = 1 - Math.exp(-hours / PUMP_TAU_H);
  const C: Concs = { k: { ...state.C.k }, na: { ...state.C.na }, cl: { ...state.C.cl } };
  for (const ion of ION_ORDER) C[ion].in += (rest[ion].in - C[ion].in) * k;
  return C;
}

export interface Preset {
  label: string;
  P: Perms;
  C: Concs;
  tempC: number;
  pump: boolean;
  caption: string;
}

const squid: Concs = { k: { in: 400, out: 20 }, na: { in: 50, out: 440 }, cl: { in: 40, out: 560 } };

export const PRESETS: Record<string, Preset> = {
  neuron: {
    label: 'Typical neuron',
    P: { k: 1, na: 0.04, cl: 0.45 },
    C: typicalConcs(),
    tempC: 37,
    pump: true,
    caption: 'At rest the membrane leaks mostly K⁺, so the voltage sits close to potassium’s Nernst potential.',
  },
  'only-k': {
    label: 'Only K⁺ leaks',
    P: { k: 1, na: 0, cl: 0 },
    C: typicalConcs(),
    tempC: 37,
    pump: true,
    caption: 'With only potassium channels open, the membrane goes all the way to E_K.',
  },
  'only-na': {
    label: 'Only Na⁺ leaks',
    P: { k: 0, na: 1, cl: 0 },
    C: typicalConcs(),
    tempC: 37,
    pump: true,
    caption: 'With only sodium channels open, the inside turns positive, all the way to E_Na.',
  },
  'spike-peak': {
    label: 'Peak of a spike',
    P: { k: 1, na: 15, cl: 0.45 },
    C: typicalConcs(),
    tempC: 37,
    pump: true,
    caption: 'During a spike, sodium permeability jumps far above potassium’s, and the voltage swings towards E_Na.',
  },
  hyperkalaemia: {
    label: 'High potassium outside',
    P: { k: 1, na: 0.04, cl: 0.45 },
    C: { ...typicalConcs(), k: { in: 140, out: 12 } },
    tempC: 37,
    pump: true,
    caption: 'More K⁺ outside means a smaller concentration push, so less K⁺ leaks out and the membrane depolarises.',
  },
  squid: {
    label: 'Squid giant axon',
    P: { k: 1, na: 0.04, cl: 0.45 },
    C: squid,
    tempC: 20,
    pump: true,
    caption: 'The squid giant axon, with the permeability ratio Hodgkin and Katz measured in 1949: 1 : 0.04 : 0.45.',
  },
  'pump-off': {
    label: 'Switch the pump off',
    P: { k: 1, na: 0.04, cl: 0.45 },
    C: typicalConcs(),
    tempC: 37,
    pump: false,
    caption: 'Pump off: the voltage hardly changes at first, then slowly runs down as the gradients leak away.',
  },
};
