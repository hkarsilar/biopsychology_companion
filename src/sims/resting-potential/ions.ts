/**
 * Shared electrochemistry for the resting potential simulations.
 * Voltages are inside relative to outside, in mV. Concentrations in mM.
 */

export type IonId = 'k' | 'na' | 'cl';

export interface IonInfo {
  id: IonId;
  name: string;
  symbol: string;
  z: number;
  /** Typical mammalian neuron concentrations, mM */
  cIn: number;
  cOut: number;
  /** Shape used in drawings, so colour is never the only cue */
  shape: 'k' | 'na' | 'cl';
  cssVar: string;
}

export const IONS: Record<IonId, IonInfo> = {
  k: { id: 'k', name: 'Potassium', symbol: 'K⁺', z: 1, cIn: 140, cOut: 5, shape: 'k', cssVar: '--ion-k' },
  na: { id: 'na', name: 'Sodium', symbol: 'Na⁺', z: 1, cIn: 12, cOut: 145, shape: 'na', cssVar: '--ion-na' },
  cl: { id: 'cl', name: 'Chloride', symbol: 'Cl⁻', z: -1, cIn: 10, cOut: 110, shape: 'cl', cssVar: '--ion-cl' },
};

export const ION_ORDER: IonId[] = ['k', 'na', 'cl'];

const R = 8.314462618; // J/(mol·K)
const F = 96485.33212; // C/mol

/** RT/F in millivolts at a temperature in °C (26.7 mV at body temperature). */
export function rtf(tempC: number): number {
  return ((R * (273.15 + tempC)) / F) * 1000;
}

/**
 * Nernst equation: the voltage at which an ion's electrical pull exactly balances its
 * concentration push, so it stops flowing on balance.
 */
export function nernst(z: number, cIn: number, cOut: number, tempC = 37): number {
  return (rtf(tempC) / z) * Math.log(cOut / cIn);
}

/**
 * How hard each force pushes the ion OUT of the cell, expressed in mV (energy per unit charge
 * per mole of ions, divided by F). Positive = outward, negative = inward.
 * - concentration: from high to low concentration
 * - electrical: from the voltage across the membrane
 * Their sum is z·(V − E), zero exactly at the Nernst potential.
 */
export function forces(z: number, cIn: number, cOut: number, V: number, tempC = 37) {
  const concentration = rtf(tempC) * Math.log(cIn / cOut);
  const electrical = z * V;
  return { concentration, electrical, net: concentration + electrical };
}

/** Real ions that must cross to charge a round cell's membrane to V. Membrane: 1 µF/cm². */
export function ionsToCharge(V: number, diameterUm = 25): number {
  const r = (diameterUm / 2) * 1e-4; // cm
  const area = 4 * Math.PI * r * r; // cm²
  const C = 1e-6 * area; // F
  return Math.abs((C * V * 1e-3) / 1.602176634e-19);
}

/** Real ions of one kind inside the same round cell. */
export function ionsInside(cIn: number, diameterUm = 25): number {
  const r = (diameterUm / 2) * 1e-4; // cm
  const litres = ((4 / 3) * Math.PI * r ** 3) / 1000;
  return (cIn / 1000) * litres * 6.02214076e23;
}
