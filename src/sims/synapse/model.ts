/**
 * A chemical synapse, from the spike arriving at the terminal to the postsynaptic potential (PSP)
 * and the clean-up afterwards. It is a teaching model: every step is a simple equation with a
 * realistic order of events and roughly realistic timing, not a fit to one particular synapse.
 *
 * Units: time ms, voltage mV. Calcium, transmitter and drug amounts are relative units
 * (calcium ≈ 1 at the peak of one spike; one vesicle adds `quantum` to the cleft).
 *
 * The chain of events:
 *  1. A spike arrives: the terminal's voltage follows a fixed spike shape.
 *  2. Voltage-gated Ca²⁺ channels open (gate c relaxes towards c∞(V)).
 *  3. Ca²⁺ flows in, most strongly as the spike falls (bigger driving force), then is pumped away.
 *  4. Docked vesicles fuse at a rate that rises steeply with calcium (fourth power), and
 *     the docked pool refills slowly from the reserve.
 *  5. Transmitter enters the cleft and is cleared by reuptake, enzymes and diffusion.
 *  6. It binds receptors (fast equilibrium, competing with any agonist or antagonist).
 *  7. Ionotropic receptors open their own channels; metabotropic ones act through a slower
 *     two-step G-protein cascade that opens separate channels.
 *  8. The postsynaptic membrane is a leaky RC circuit pulled towards the channels' reversal
 *     potential: an EPSP or an IPSP.
 *  9. Presynaptic autoreceptors sense cleft transmitter and turn release down a little.
 */

export type TransmitterId = 'glutamate' | 'gaba' | 'ach' | 'serotonin';
export type DrugId = 'none' | 'agonist' | 'antagonist' | 'reuptake' | 'enzyme' | 'release-block' | 'release-boost';

export interface SynapseType {
  id: TransmitterId;
  /** Name of the transmitter */
  name: string;
  /** The receptor in this model */
  receptorName: string;
  receptor: 'ionotropic' | 'metabotropic';
  /** The ion that carries most of the postsynaptic current */
  ion: 'na' | 'cl' | 'k';
  /** Reversal potential of the postsynaptic current (mV) */
  eRev: number;
  effect: 'excitatory' | 'inhibitory';
  /** Clearance rates (per ms): reuptake transporters, an enzyme in the cleft, diffusion away */
  kUptake: number;
  kEnzyme: number;
  kDiffuse: number;
  /** Is there an enzyme inside the terminal that breaks the transmitter down (MAO, GABA transaminase)? */
  enzymeInTerminal: boolean;
  /** Transmitter added to the cleft by one vesicle (relative units) */
  quantum: number;
  /** Receptor dissociation constant (same units as cleft transmitter) */
  kd: number;
  /** Peak postsynaptic conductance relative to the resting (leak) conductance */
  gMax: number;
  /** Ionotropic: how fast the channels follow receptor binding (ms) */
  tauChannel: number;
  /** Metabotropic: the two steps of the G-protein cascade (ms) */
  tauG1: number;
  tauG2: number;
  /** Time window shown on the traces (ms) */
  window: number;
}

export const SYNAPSES: Record<TransmitterId, SynapseType> = {
  glutamate: {
    id: 'glutamate',
    name: 'Glutamate',
    receptorName: 'AMPA receptor (ionotropic)',
    receptor: 'ionotropic',
    ion: 'na',
    eRev: 0,
    effect: 'excitatory',
    kUptake: 0.55,
    kEnzyme: 0,
    kDiffuse: 0.25,
    enzymeInTerminal: false,
    quantum: 1,
    kd: 0.9,
    gMax: 0.95,
    tauChannel: 1.2,
    tauG1: 15,
    tauG2: 60,
    window: 40,
  },
  gaba: {
    id: 'gaba',
    name: 'GABA',
    receptorName: 'GABA-A receptor (ionotropic)',
    receptor: 'ionotropic',
    ion: 'cl',
    eRev: -80,
    effect: 'inhibitory',
    kUptake: 0.45,
    kEnzyme: 0,
    kDiffuse: 0.2,
    enzymeInTerminal: true,
    quantum: 1,
    kd: 0.9,
    gMax: 2.2,
    tauChannel: 5,
    tauG1: 15,
    tauG2: 60,
    window: 40,
  },
  ach: {
    id: 'ach',
    name: 'Acetylcholine',
    receptorName: 'nicotinic receptor (ionotropic)',
    receptor: 'ionotropic',
    ion: 'na',
    eRev: 0,
    effect: 'excitatory',
    kUptake: 0,
    kEnzyme: 1.6,
    kDiffuse: 0.2,
    enzymeInTerminal: false,
    quantum: 1,
    kd: 0.6,
    gMax: 1.0,
    tauChannel: 1.2,
    tauG1: 15,
    tauG2: 60,
    window: 40,
  },
  serotonin: {
    id: 'serotonin',
    name: 'Serotonin',
    receptorName: '5-HT1A receptor (metabotropic)',
    receptor: 'metabotropic',
    ion: 'k',
    eRev: -90,
    effect: 'inhibitory',
    kUptake: 0.07,
    kEnzyme: 0,
    kDiffuse: 0.02,
    enzymeInTerminal: true,
    quantum: 0.5,
    kd: 1.2,
    gMax: 3,
    tauChannel: 1,
    tauG1: 20,
    tauG2: 90,
    window: 400,
  },
};

/** What a drug does to the model's numbers. 1 means "no change". */
export interface DrugEffect {
  /** Agonist concentration relative to its own receptor affinity */
  agonist: number;
  /** Antagonist concentration relative to its own receptor affinity */
  antagonist: number;
  uptake: number;
  enzyme: number;
  /** Multiplies the vesicle fusion rate */
  fusion: number;
  /** Multiplies the amount of transmitter in each vesicle */
  quantum: number;
  /** False when the drug has nothing to act on at this synapse */
  hasTarget: boolean;
}

const NO_DRUG: DrugEffect = { agonist: 0, antagonist: 0, uptake: 1, enzyme: 1, fusion: 1, quantum: 1, hasTarget: true };

export function drugEffect(drug: DrugId, type: SynapseType): DrugEffect {
  switch (drug) {
    case 'agonist':
      return { ...NO_DRUG, agonist: 0.1 };
    case 'antagonist':
      return { ...NO_DRUG, antagonist: 5 };
    case 'reuptake':
      return type.kUptake > 0 ? { ...NO_DRUG, uptake: 0.1 } : { ...NO_DRUG, hasTarget: false };
    case 'enzyme':
      // A cleft enzyme (acetylcholinesterase) clears the transmitter; an enzyme inside the
      // terminal (MAO, GABA transaminase) breaks down spare transmitter, so blocking it
      // leaves more to pack into each vesicle.
      if (type.kEnzyme > 0) return { ...NO_DRUG, enzyme: 0.05 };
      if (type.enzymeInTerminal) return { ...NO_DRUG, quantum: 1.5 };
      return { ...NO_DRUG, hasTarget: false };
    case 'release-block':
      return { ...NO_DRUG, fusion: 0.04 };
    case 'release-boost':
      return { ...NO_DRUG, fusion: 2.6 };
    default:
      return { ...NO_DRUG };
  }
}

/** Fixed constants of the terminal and the postsynaptic membrane. */
export const C = {
  vRestPre: -65,
  vRestPost: -65,
  /** Threshold drawn on the postsynaptic trace (mV), for comparison only */
  threshold: -55,
  spikePeak: 100,
  spikeTau: 0.35,
  caTau: 0.25,
  caV50: -20,
  caSlope: 6,
  eCa: 120,
  caInflux: 2.6,
  caClear: 1.5,
  /** Calcium at which release runs at half its maximum rate */
  caHalf: 0.7,
  /** Maximum fusion rate per docked vesicle (per ms) */
  kFusion: 0.34,
  docked: 8,
  refillTau: 300,
  autoKd: 2,
  autoTau: 40,
  /** How strongly fully active autoreceptors reduce release (0 to 1) */
  autoStrength: 0.5,
  tauM: 15,
  dt: 0.005,
};

export interface SynState {
  t: number;
  /** Presynaptic terminal voltage */
  vPre: number;
  /** Ca²⁺ channel open fraction, 0 to 1 */
  caGate: number;
  /** Ca²⁺ inside the terminal (relative) */
  ca: number;
  /** Vesicles docked and ready to fuse (may be fractional: it is an average) */
  docked: number;
  /** Total vesicles released so far (fractional, as an expected value) */
  released: number;
  /** Transmitter in the cleft (relative) */
  cleft: number;
  /** Fraction of receptors with something bound that activates them */
  occupancy: number;
  /** Ionotropic channel open fraction, or the final step of the G-protein cascade */
  open: number;
  /** First step of the G-protein cascade (metabotropic only) */
  gProtein: number;
  /** Autoreceptor activation, 0 to 1 */
  auto: number;
  /** Postsynaptic membrane potential */
  v: number;
}

export type SynEvent = 'arrival' | 'ca-open' | 'ca-in' | 'fusion' | 'binding' | 'channels' | 'psp-peak' | 'cleared' | 'recycled';

/** The steps of synaptic transmission in the order students should learn them. */
export const STAGES: { id: SynEvent; title: string }[] = [
  { id: 'arrival', title: 'A spike arrives at the terminal' },
  { id: 'ca-open', title: 'Voltage-gated calcium channels open' },
  { id: 'ca-in', title: 'Calcium flows into the terminal' },
  { id: 'fusion', title: 'Vesicles fuse and release transmitter' },
  { id: 'binding', title: 'Transmitter crosses the cleft and binds to receptors' },
  { id: 'channels', title: 'Ion channels open: a postsynaptic potential begins' },
  { id: 'cleared', title: 'Transmitter is cleared from the cleft' },
  { id: 'psp-peak', title: 'The postsynaptic potential peaks, then fades' },
  { id: 'recycled', title: 'Vesicles are recycled and refilled' },
];

export function restState(): SynState {
  return {
    t: 0,
    vPre: C.vRestPre,
    caGate: caInf(C.vRestPre),
    ca: 0,
    docked: C.docked,
    released: 0,
    cleft: 0,
    occupancy: 0,
    open: 0,
    gProtein: 0,
    auto: 0,
    v: C.vRestPost,
  };
}

export function caInf(v: number): number {
  return 1 / (1 + Math.exp(-(v - C.caV50) / C.caSlope));
}

/** Terminal voltage for a set of spike arrival times (ms). */
export function terminalVoltage(t: number, spikes: number[]): number {
  let v = C.vRestPre;
  for (const ts of spikes) {
    const u = t - ts;
    if (u < 0 || u > 8) continue;
    const x = u / C.spikeTau;
    v += C.spikePeak * x * Math.exp(1 - x);
  }
  return Math.min(v, 45);
}

/** Receptor occupancy with competition between transmitter, agonist and antagonist. */
export function occupancy(cleft: number, kd: number, drug: DrugEffect): number {
  const a = Math.max(0, cleft) / kd;
  const b = drug.agonist;
  const x = drug.antagonist;
  return (a + b) / (1 + a + b + x);
}

/** Release rate (vesicles per ms) at a given calcium level, with every docked vesicle counted. */
export function releaseRate(s: SynState, drug: DrugEffect): number {
  const c4 = s.ca ** 4;
  const h = c4 / (c4 + C.caHalf ** 4);
  return C.kFusion * drug.fusion * (1 - C.autoStrength * s.auto) * h * s.docked;
}

export class Synapse {
  s: SynState = restState();
  type: SynapseType;
  drug: DrugId;
  eff: DrugEffect;
  /** Spike arrival times at the terminal */
  spikes: number[] = [];
  /** Highest cleft level since the last spike, for the "cleared" event */
  private cleftPeak = 0;
  private stageFlags = new Set<SynEvent>();
  private pspSign = 0;
  private lastDv = 0;
  /** Time of the most recent spike while its events are still being tracked, else null */
  private armedAt: number | null = null;
  /** Events that happened in the same step as the one last returned by advanceToNextEvent */
  private pending: SynEvent[] = [];

  constructor(type: TransmitterId = 'glutamate', drug: DrugId = 'none') {
    this.type = SYNAPSES[type];
    this.drug = drug;
    this.eff = drugEffect(drug, this.type);
  }

  setType(type: TransmitterId): void {
    this.type = SYNAPSES[type];
    this.eff = drugEffect(this.drug, this.type);
  }

  setDrug(drug: DrugId): void {
    this.drug = drug;
    this.eff = drugEffect(drug, this.type);
  }

  reset(): void {
    this.s = restState();
    this.spikes = [];
    this.cleftPeak = 0;
    this.stageFlags.clear();
    this.pspSign = 0;
    this.lastDv = 0;
    this.armedAt = null;
    this.pending = [];
    // Start from the steady state the drug creates (an agonist holds receptors partly open).
    this.settle(400);
  }

  /** Run with no spikes until the drug's steady state is reached, keeping the clock at 0. */
  private settle(ms: number): void {
    for (let t = 0; t < ms; t += 0.05) this.integrate(0.05);
    this.s.t = 0;
    this.s.released = 0;
  }

  /** Schedule a presynaptic spike at time t (defaults to now). */
  fire(t = this.s.t): void {
    this.spikes.push(t);
    this.armedAt = t;
    this.stageFlags.clear();
    this.cleftPeak = 0;
    this.pspSign = 0;
  }

  /** Advance by `ms`. Returns the events that happened, in order. */
  advance(ms: number): SynEvent[] {
    const events: SynEvent[] = [];
    const n = Math.max(1, Math.round(ms / C.dt));
    for (let i = 0; i < n; i++) this.stepOnce(events);
    this.spikes = this.spikes.filter((ts) => this.s.t - ts < 10);
    return events;
  }

  /** Advance until the next event (or `maxMs`). Returns the event, or null. */
  advanceToNextEvent(maxMs = 1500): SynEvent | null {
    if (this.pending.length) return this.pending.shift()!;
    const events: SynEvent[] = [];
    const end = this.s.t + maxMs;
    while (this.s.t < end && events.length === 0) this.stepOnce(events);
    this.spikes = this.spikes.filter((ts) => this.s.t - ts < 10);
    this.pending = events.slice(1);
    return events[0] ?? null;
  }

  /** True while a spike's chain of events is still being followed. */
  tracking(): boolean {
    return this.armedAt !== null || this.pending.length > 0;
  }

  /** Is anything still happening that is worth watching? */
  active(): boolean {
    const s = this.s;
    return (
      this.spikes.some((ts) => s.t - ts < 6) ||
      s.ca > 0.02 ||
      s.cleft > 0.02 ||
      Math.abs(s.v - this.baseline()) > 0.15 ||
      Math.abs(s.gProtein) > 0.01
    );
  }

  /** Where the postsynaptic voltage sits with no spikes (rest, or shifted by an agonist). */
  baseline(): number {
    const o = occupancy(0, this.type.kd, this.eff);
    const g = this.type.gMax * o;
    return (C.vRestPost + g * this.type.eRev) / (1 + g);
  }

  private stepOnce(events: SynEvent[]): void {
    const before = { ...this.s };
    this.integrate(C.dt);
    const s = this.s;
    const f = this.stageFlags;
    const mark = (e: SynEvent) => {
      if (!f.has(e)) {
        f.add(e);
        events.push(e);
      }
    };
    if (this.armedAt === null) return;
    if (before.vPre < -20 && s.vPre >= -20) mark('arrival');
    if (f.has('arrival') && before.caGate < 0.3 && s.caGate >= 0.3) mark('ca-open');
    if (f.has('ca-open') && before.ca < 0.25 && s.ca >= 0.25) mark('ca-in');
    if (f.has('ca-in') && Math.floor(before.released * 4) < Math.floor(s.released * 4)) mark('fusion');
    this.cleftPeak = Math.max(this.cleftPeak, s.cleft);
    if (f.has('fusion') && s.occupancy - this.restOccupancy() > 0.05) mark('binding');
    const dv = s.v - this.baseline();
    if (f.has('binding') && Math.abs(dv) > 0.4 && !f.has('channels')) {
      mark('channels');
      this.pspSign = Math.sign(dv);
    }
    const slope = s.v - before.v;
    if (f.has('channels') && Math.sign(slope) === -this.pspSign && Math.sign(this.lastDv) === this.pspSign) mark('psp-peak');
    this.lastDv = slope;
    const sinceSpike = s.t - this.armedAt;
    if (f.has('fusion') && this.cleftPeak > 0 && s.cleft < this.cleftPeak * 0.1 && (f.has('channels') || sinceSpike > 8)) mark('cleared');
    if (f.has('cleared') && s.docked > C.docked - 0.5) {
      mark('recycled');
      this.armedAt = null;
    }
    if (sinceSpike > 4000) this.armedAt = null;
  }

  private restOccupancy(): number {
    return occupancy(0, this.type.kd, this.eff);
  }

  /** Forward Euler step of every variable. */
  private integrate(dt: number): void {
    const s = this.s;
    const T = this.type;
    const e = this.eff;
    const t = s.t + dt;
    const vPre = terminalVoltage(t, this.spikes);
    const caGate = s.caGate + ((caInf(vPre) - s.caGate) / C.caTau) * dt;
    const drive = Math.max(0, (C.eCa - vPre) / (C.eCa - C.vRestPre));
    const caOpenAboveRest = Math.max(0, caGate - caInf(C.vRestPre));
    const ca = s.ca + (C.caInflux * caOpenAboveRest * drive - s.ca / C.caClear) * dt;
    const rel = releaseRate(s, e);
    const docked = s.docked + (-rel + (C.docked - s.docked) / C.refillTau) * dt;
    const kOut = T.kUptake * e.uptake + T.kEnzyme * e.enzyme + T.kDiffuse;
    const cleft = s.cleft + (rel * T.quantum * e.quantum - kOut * s.cleft) * dt;
    const occ = occupancy(cleft, T.kd, e);
    let open = s.open;
    let gProtein = s.gProtein;
    if (T.receptor === 'ionotropic') {
      open += ((occ - open) / T.tauChannel) * dt;
    } else {
      gProtein += ((occ - gProtein) / T.tauG1) * dt;
      open += ((gProtein - open) / T.tauG2) * dt;
    }
    const autoTarget = cleft / (cleft + C.autoKd);
    const auto = s.auto + ((autoTarget - s.auto) / C.autoTau) * dt;
    const g = T.gMax * open;
    const v = s.v + ((-(s.v - C.vRestPost) - g * (s.v - T.eRev)) / C.tauM) * dt;
    this.s = { t, vPre, caGate, ca, docked, released: s.released + rel * dt, cleft, occupancy: occ, open, gProtein, auto, v };
  }
}

/** Run one spike from rest and report the peaks. Used by tests and by the lesson's numbers. */
export function singleSpike(type: TransmitterId, drug: DrugId = 'none', duration?: number) {
  const syn = new Synapse(type, drug);
  syn.reset();
  const base = syn.baseline();
  syn.fire(1);
  const end = duration ?? SYNAPSES[type].window;
  let peakCa = 0;
  let peakCleft = 0;
  let peakDv = 0;
  let cleftHalfTime = 0;
  let pspArea = 0;
  const events: { e: SynEvent; t: number }[] = [];
  while (syn.s.t < end) {
    const ev = syn.advance(0.05);
    for (const e of ev) events.push({ e, t: syn.s.t });
    peakCa = Math.max(peakCa, syn.s.ca);
    if (syn.s.cleft > peakCleft) peakCleft = syn.s.cleft;
    else if (!cleftHalfTime && syn.s.cleft < peakCleft / 2) cleftHalfTime = syn.s.t;
    const dv = syn.s.v - base;
    if (Math.abs(dv) > Math.abs(peakDv)) peakDv = dv;
    pspArea += Math.abs(dv) * 0.05;
  }
  return { peakCa, peakCleft, cleftHalfTime, peakDv, pspArea, released: syn.s.released, base, events };
}
