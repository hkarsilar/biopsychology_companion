import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { drawIon, fitCanvas, readPalette, rng, roundRect, smoothstep, withAlpha } from '../shared/canvas';
import { click, unlockAudio } from '../shared/audio';
import { setSetting, soundOn } from '../shared/settings';
import {
  conductances,
  currents,
  defaultParams,
  describePhase,
  ionsFromCharge,
  phaseText,
  restingState,
  squidInternalNaChange,
  steadyGates,
  step,
  stimulusAt,
  type HHParams,
  type HHState,
  type Phase,
  type Pulse,
} from './model';

/**
 * <nc-action-potential>: a patch of axon membrane you can stimulate, drug and slow down.
 *
 * Attributes: preset, strength, gap, hold, drugs ("ttx,tea,anemone"), speed, predict, lab-href, present.
 */

interface Sample {
  t: number;
  V: number;
  gNa: number;
  gK: number;
  stim: boolean;
}

interface Particle {
  kind: 'na' | 'k';
  x: number;
  /** 0 → 1 along the path through the channel */
  p: number;
  jitter: number;
}

interface Preset {
  strength?: number;
  gap?: number;
  hold?: number;
  ttx?: boolean;
  tea?: boolean;
  anemone?: boolean;
  speed?: number;
  zap?: 'single' | 'pair' | 'none';
  caption?: string;
}

export const AP_PRESETS: Record<string, Preset> = {
  single: { zap: 'single' },
  rest: { zap: 'none' },
  subthreshold: { strength: 8, zap: 'single', caption: 'This zap is too weak. Raise the strength and zap again.' },
  'threshold-hunt': {
    strength: 6,
    zap: 'none',
    caption: 'Find the weakest zap that still makes a spike: raise the strength a little at a time.',
  },
  pair: { gap: 6, zap: 'pair' },
  train: { hold: 10, zap: 'none' },
  block: { hold: 120, zap: 'none', caption: 'A huge steady current: watch what happens after the first spike.' },
  ttx: { ttx: true, zap: 'single' },
  tea: { tea: true, zap: 'single' },
  anemone: { anemone: true, zap: 'single' },
};

const SPEEDS = [0.25, 0.5, 1, 2, 4];
const WINDOW = 30;
const DT = 0.01;
const SAMPLE_EVERY = 0.05;
const N_NA = 3;
const N_K = 3;
const REST = restingState();
const GATE_REST = steadyGates(-65);

const QUESTIONS: Record<string, PredictQuestion> = {
  threshold: {
    id: 'threshold',
    question: 'The membrane has just crossed threshold. What happens next?',
    options: [
      'It drifts back down to rest.',
      'It shoots up to about +40 mV.',
      'It stays at this voltage until the stimulus ends.',
    ],
    correct: 1,
    explain:
      'Past threshold, opening sodium channels let in Na⁺, which depolarises the membrane further and opens even more sodium channels. This positive feedback drives the spike up.',
  },
  ttx: {
    id: 'ttx',
    question: 'TTX has plugged the sodium channels. What will this zap do?',
    options: ['Make a normal spike.', 'Make a smaller, slower spike.', 'Make no spike, only a small bump.'],
    correct: 2,
    explain:
      'Without sodium channels there is no positive feedback, so the stimulus only nudges the voltage and it slides back. This is why TTX paralyses: nerves and muscles cannot fire.',
  },
  tea: {
    id: 'tea',
    question: 'TEA blocks the voltage-gated potassium channels. How will the spike end?',
    options: ['Faster than normal.', 'More slowly, so the spike is wider.', 'Exactly as before.'],
    correct: 1,
    explain:
      'Potassium flowing out is what pulls the voltage back down. With fewer K⁺ channels, repolarisation relies on sodium inactivation and leak alone, so the spike lasts longer and the undershoot shrinks.',
  },
  anemone: {
    id: 'anemone',
    question: 'This toxin makes sodium channels slow to inactivate. What will the spike look like?',
    options: ['Shorter than normal.', 'Much longer, with a plateau.', 'No different.'],
    correct: 1,
    explain:
      'Inactivation normally shuts sodium channels within a millisecond. If they stay open longer, Na⁺ keeps flowing in and holds the membrane up in a long plateau.',
  },
};

export class ActionPotentialElement extends SimElement {
  private params: HHParams = { ...defaultParams };
  private s: HHState = { ...REST };
  private pulses: Pulse[] = [];
  private holdOn = false;
  private holdAmp = 10;
  private strength = 20;
  private gap = 8;
  private speed = 1;
  private samples: Sample[] = [];
  private lastSampleT = -Infinity;
  private dVdt = 0;
  private phase: Phase = 'rest';
  private spikes = 0;
  private naAcc = 0;
  private inSpike = false;
  private lastSpikeIons = 0;
  private restINa = currents(REST, defaultParams).INa;
  private restIK = currents(REST, defaultParams).IK;
  private particles: Particle[] = [];
  private spawnNa = 0;
  private spawnK = 0;
  private clock = 0;
  private lastReadout = 0;

  private membrane!: HTMLCanvasElement;
  private trace!: HTMLCanvasElement;

  static get observedAttributes() {
    return ['present'];
  }

  attributeChangedCallback() {
    this.render();
  }

  protected build(): void {
    this.html(`
      <style>
        /* Side by side, the membrane matches the height of the wider trace panel. */
        @container (min-width: 760px) {
          canvas.membrane { aspect-ratio: 16 / 15 !important; }
        }
        /* On phones the trace gets taller so its two panels stay readable. */
        @container (max-width: 479px) {
          canvas.trace { aspect-ratio: 1 / 1 !important; }
        }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Action potential lab<small>A patch of squid axon membrane · Hodgkin–Huxley model</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Play"><span aria-hidden="true">▶</span> <span class="lbl">Play</span></button>
            <button class="step" type="button" aria-label="Step forward 0.1 milliseconds" title="Step 0.1 ms">⏭</button>
            <button class="reset" type="button" aria-label="Reset" title="Reset">↺</button>
            <label class="visually-hidden" for="speed">Speed</label>
            <select id="speed" class="speed" aria-label="Speed">
              ${SPEEDS.map((s) => `<option value="${s}">${s} ms per second</option>`).join('')}
            </select>
            <span class="timescale"></span>
          </div>
        </div>
        <p class="caption" aria-live="off"></p>
        <div class="views two">
          <figure>
            <canvas class="membrane" style="aspect-ratio: 4 / 3.1" role="img" aria-label="Animated patch of membrane with sodium and potassium channels"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="round" style="background: var(--ion-na)"></i>Na⁺ (circles)</span>
                <span><i style="background: var(--ion-k)"></i>K⁺ (squares)</span>
                <span>± signs show the charge on each side</span>
              </span>
            </figcaption>
          </figure>
          <figure>
            <canvas class="trace" style="aspect-ratio: 16 / 12" role="img" aria-label="Membrane voltage and channel conductances over the last 30 milliseconds"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="line" style="background: var(--trace)"></i>Voltage</span>
                <span><i class="line" style="background: var(--ion-na)"></i>Na⁺ conductance (solid)</span>
                <span><i class="line" style="background: var(--ion-k)"></i>K⁺ conductance (dashed)</span>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="readouts" role="group" aria-label="Readouts">
          <span><b>Voltage</b><span class="r-v"></span></span>
          <span><b>g<sub>Na</sub></b><span class="r-gna"></span></span>
          <span><b>g<sub>K</sub></b><span class="r-gk"></span></span>
          <span><b>Spikes</b><span class="r-spikes">0</span></span>
          <span class="r-ions-wrap"><b>Na⁺ in, last spike</b><span class="r-ions">—</span></span>
        </div>
        <div class="controls">
          <fieldset>
            <legend>Stimulate</legend>
            <div class="slider">
              <label for="strength">Zap strength</label>
              <input id="strength" class="strength" type="range" min="0" max="60" step="0.5" />
              <output for="strength" class="o-strength"></output>
            </div>
            <div class="row">
              <button class="zap primary" type="button"><span aria-hidden="true">⚡</span> Zap</button>
              <button class="pair" type="button">Zap twice</button>
            </div>
            <div class="slider">
              <label for="gap">Gap between the two zaps</label>
              <input id="gap" class="gap" type="range" min="1" max="25" step="0.5" />
              <output for="gap" class="o-gap"></output>
            </div>
            <label class="toggle"><input type="checkbox" class="hold" /><span>Keep stimulating<small>A steady current instead of a short zap</small></span></label>
            <div class="slider">
              <label for="holdamp">Steady current</label>
              <input id="holdamp" class="holdamp" type="range" min="0" max="150" step="0.5" />
              <output for="holdamp" class="o-hold"></output>
            </div>
          </fieldset>
          <fieldset>
            <legend>Add a drug</legend>
            <label class="toggle"><input type="checkbox" class="ttx" /><span>TTX<small>Pufferfish toxin: plugs sodium channels</small></span></label>
            <label class="toggle"><input type="checkbox" class="tea" /><span>TEA<small>Blocks voltage-gated potassium channels</small></span></label>
            <label class="toggle"><input type="checkbox" class="anemone" /><span>Sea anemone toxin<small>Slows sodium channel inactivation</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Options</legend>
            <label class="toggle"><input type="checkbox" class="sound" /><span>Sound<small>A click for every spike, like a lab audio monitor</small></span></label>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Pause at key moments and ask what comes next</small></span></label>
            <div class="row">
              <button class="png" type="button">Save PNG</button>
              <button class="link" type="button">Copy link</button>
            </div>
            <p class="keys">Keys: <kbd>Space</kbd> play or pause · <kbd>Z</kbd> zap · <kbd>S</kbd> step · <kbd>R</kbd> reset</p>
          </fieldset>
        </div>
      </div>`);

    this.membrane = this.$('.membrane') as HTMLCanvasElement;
    this.trace = this.$('.trace') as HTMLCanvasElement;

    // Starting values from a preset, then any explicit attributes (as set by a shared link).
    this.applyPreset(this.getAttribute('preset') ?? 'single', false);
    const num = (name: string) => {
      const v = this.getAttribute(name);
      return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    const strength = num('strength');
    if (strength !== null) this.strength = strength;
    const gap = num('gap');
    if (gap !== null) this.gap = gap;
    const hold = num('hold');
    if (hold !== null && hold > 0) {
      this.holdOn = true;
      this.holdAmp = hold;
    }
    const speed = num('speed');
    if (speed !== null && SPEEDS.includes(speed)) this.speed = speed;
    const drugs = this.getAttribute('drugs');
    if (drugs !== null) {
      const list = drugs.split(',').map((d) => d.trim());
      this.setDrug('ttx', list.includes('ttx'));
      this.setDrug('tea', list.includes('tea'));
      this.setDrug('anemone', list.includes('anemone'));
    }
    this.syncControls();
    this.wire();
  }

  /** Apply a named preset, e.g. from a "Try this" button in a lesson. */
  applyPreset(name: string, start = true): void {
    const p = AP_PRESETS[name] ?? AP_PRESETS.single;
    this.strength = p.strength ?? 20;
    this.gap = p.gap ?? 8;
    this.holdOn = (p.hold ?? 0) > 0;
    this.holdAmp = p.hold && p.hold > 0 ? p.hold : 10;
    this.speed = p.speed ?? 1;
    this.setDrug('ttx', !!p.ttx);
    this.setDrug('tea', !!p.tea);
    this.setDrug('anemone', !!p.anemone);
    this.reset();
    if (p.zap === 'single') this.pulses.push({ start: 2, duration: 0.5, amplitude: this.strength });
    if (p.zap === 'pair')
      this.pulses.push(
        { start: 2, duration: 0.5, amplitude: this.strength },
        { start: 2 + this.gap, duration: 0.5, amplitude: this.strength },
      );
    if (this.isConnected && this.membrane) {
      this.syncControls();
      this.setCaption(p.caption ?? phaseText.rest);
      if (start) this.play();
    }
    if (p.caption) this.pinnedCaption = p.caption;
  }

  private pinnedCaption: string | null = null;

  private setDrug(which: 'ttx' | 'tea' | 'anemone', on: boolean) {
    if (which === 'ttx') this.params.naBlock = on ? 1 : 0;
    if (which === 'tea') this.params.kBlock = on ? 0.9 : 0;
    if (which === 'anemone') this.params.inactivationSlowing = on ? 8 : 1;
  }

  private syncControls() {
    const q = <T extends HTMLElement>(s: string) => this.$(s) as T;
    q<HTMLInputElement>('.strength').value = String(this.strength);
    q<HTMLInputElement>('.gap').value = String(this.gap);
    q<HTMLInputElement>('.holdamp').value = String(this.holdAmp);
    q<HTMLInputElement>('.hold').checked = this.holdOn;
    q<HTMLInputElement>('.ttx').checked = this.params.naBlock > 0;
    q<HTMLInputElement>('.tea').checked = this.params.kBlock > 0;
    q<HTMLInputElement>('.anemone').checked = this.params.inactivationSlowing > 1;
    q<HTMLInputElement>('.sound').checked = soundOn();
    q<HTMLInputElement>('.predict').checked = this.predictEnabled;
    q<HTMLSelectElement>('.speed').value = String(this.speed);
    this.updateOutputs();
  }

  private updateOutputs() {
    this.$('.o-strength').textContent = `${fmt(this.strength, 1)} µA/cm²`;
    this.$('.o-gap').textContent = `${fmt(this.gap, 1)} ms`;
    this.$('.o-hold').textContent = `${fmt(this.holdAmp, 1)} µA/cm²`;
    const slowdown = Math.round(1000 / this.speed);
    this.$('.timescale').textContent = `Slowed ${slowdown.toLocaleString('en-GB')}×`;
    (this.$('.holdamp') as HTMLInputElement).disabled = !this.holdOn;
  }

  private wire() {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => {
      unlockAudio();
      this.toggle();
    });
    on('.step', 'click', () => this.stepOnce());
    on('.reset', 'click', () => {
      this.reset();
      this.render();
    });
    on('.speed', 'change', (e) => {
      this.speed = Number((e.target as HTMLSelectElement).value);
      this.updateOutputs();
    });
    on('.strength', 'input', (e) => {
      this.strength = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.gap', 'input', (e) => {
      this.gap = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.holdamp', 'input', (e) => {
      this.holdAmp = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.hold', 'change', (e) => {
      this.holdOn = (e.target as HTMLInputElement).checked;
      this.pinnedCaption = null;
      this.updateOutputs();
      if (this.holdOn && !this.playing) this.play();
    });
    on('.zap', 'click', () => void this.zap(false));
    on('.pair', 'click', () => void this.zap(true));
    for (const d of ['ttx', 'tea', 'anemone'] as const) {
      on(`.${d}`, 'change', (e) => {
        this.setDrug(d, (e.target as HTMLInputElement).checked);
        this.pinnedCaption = null;
        this.announce(`${d.toUpperCase()} ${(e.target as HTMLInputElement).checked ? 'added' : 'washed out'}`, true);
      });
    }
    on('.sound', 'change', (e) => {
      const v = (e.target as HTMLInputElement).checked;
      if (v) unlockAudio();
      setSetting('sound', v);
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.png', 'click', () => this.savePng([this.membrane, this.trace], 'Action potential lab', 'action-potential.png'));
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'INPUT') {
        e.preventDefault();
        this.toggle();
      } else if ((e.key === 'z' || e.key === 'Z') && tag !== 'SELECT') {
        void this.zap(false);
      } else if (e.key === 's' || e.key === 'S') {
        this.stepOnce();
      } else if (e.key === 'r' || e.key === 'R') {
        this.reset();
        this.render();
      }
    });
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
  }

  protected onSettings(): void {
    const box = this.root.querySelector('.sound') as HTMLInputElement | null;
    if (box) box.checked = soundOn();
  }

  protected onPlayState(): void {
    const b = this.root.querySelector('.play');
    if (!b) return;
    b.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    b.querySelector('span[aria-hidden]')!.textContent = this.playing ? '❚❚' : '▶';
    b.querySelector('.lbl')!.textContent = this.playing ? 'Pause' : 'Play';
  }

  private async zap(pair: boolean) {
    unlockAudio();
    this.pinnedCaption = null;
    // Ask before the zap when a drug changes the outcome.
    if (this.predictEnabled) {
      if (this.params.naBlock > 0) await this.ask(QUESTIONS.ttx);
      else if (this.params.kBlock > 0) await this.ask(QUESTIONS.tea);
      else if (this.params.inactivationSlowing > 1) await this.ask(QUESTIONS.anemone);
      else if (pair && this.gap <= 12) await this.ask(this.refractoryQuestion());
    }
    const t0 = this.s.t + 0.2;
    this.pulses.push({ start: t0, duration: 0.5, amplitude: this.strength });
    if (pair) this.pulses.push({ start: t0 + this.gap, duration: 0.5, amplitude: this.strength });
    this.announce(pair ? `Two zaps, ${fmt(this.gap, 1)} ms apart` : 'Zap', true);
    if (!this.playing) this.play();
  }

  /** Work out the real answer by running the model ahead from the current state. */
  private refractoryQuestion(): PredictQuestion {
    let s = { ...this.s };
    const t0 = s.t + 0.2;
    const pulses: Pulse[] = [
      { start: t0, duration: 0.5, amplitude: this.strength },
      { start: t0 + this.gap, duration: 0.5, amplitude: this.strength },
    ];
    let peak1 = -100;
    let peak2 = -100;
    const end = t0 + this.gap + 15;
    while (s.t < end) {
      s = step(s, stimulusAt(s.t, pulses, this.holdOn ? this.holdAmp : 0), DT, this.params);
      if (s.t < t0 + this.gap) peak1 = Math.max(peak1, s.V);
      else peak2 = Math.max(peak2, s.V);
    }
    let correct = 1;
    if (peak2 > 0) correct = peak2 > peak1 - 12 ? 0 : 2;
    const explain = [
      'The second zap came late enough: most sodium channels had recovered from inactivation, so a full spike fired.',
      'Too soon: many sodium channels were still inactivated and potassium channels still open, so the membrane was refractory.',
      'Some sodium channels had recovered, but not all, so the second spike was smaller: the relative refractory period.',
    ][correct];
    return {
      id: `refractory-${this.gap}-${this.strength}`,
      question: `A second zap will arrive ${fmt(this.gap, 1)} ms after the first. Will it make a second spike?`,
      options: ['Yes, a full spike.', 'No, the membrane is refractory.', 'Yes, but a smaller one.'],
      correct,
      explain,
    };
  }

  private async copyLink() {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    u.searchParams.set('strength', String(this.strength));
    u.searchParams.set('gap', String(this.gap));
    if (this.holdOn) u.searchParams.set('hold', String(this.holdAmp));
    const drugs = [
      this.params.naBlock > 0 && 'ttx',
      this.params.kBlock > 0 && 'tea',
      this.params.inactivationSlowing > 1 && 'anemone',
    ].filter(Boolean);
    if (drugs.length) u.searchParams.set('drugs', drugs.join(','));
    if (this.speed !== 1) u.searchParams.set('speed', String(this.speed));
    const btn = this.$('.link');
    try {
      await navigator.clipboard.writeText(u.toString());
      btn.textContent = 'Link copied';
    } catch {
      prompt('Copy this link:', u.toString());
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
  }

  reset(): void {
    this.s = { ...REST };
    this.pulses = [];
    this.samples = [];
    this.lastSampleT = -Infinity;
    this.dVdt = 0;
    this.spikes = 0;
    this.naAcc = 0;
    this.inSpike = false;
    this.lastSpikeIons = 0;
    this.particles = [];
    this.phase = 'rest';
    this.restINa = currents(REST, defaultParams).INa;
    this.restIK = currents(REST, defaultParams).IK;
    this.record(true);
  }

  stepOnce(): void {
    this.pause();
    this.advance(0.1);
    this.render();
  }

  protected tick(dtReal: number): void {
    this.clock += dtReal;
    const advanced = this.advance(dtReal * this.speed);
    this.updateParticles(dtReal, advanced);
  }

  /** Advance the model by `ms` of model time. Returns the model time actually advanced. */
  private advance(ms: number): number {
    const steps = Math.max(1, Math.round(ms / DT));
    const t0 = this.s.t;
    for (let i = 0; i < steps; i++) {
      const I = stimulusAt(this.s.t, this.pulses, this.holdOn ? this.holdAmp : 0);
      const before = this.s.V;
      this.s = step(this.s, I, DT, this.params);
      const V = this.s.V;
      this.dVdt = (V - before) / DT;

      // Sodium bookkeeping for the ion counter.
      const extra = this.restINa - currents(this.s, this.params).INa;
      if (!this.inSpike && V > -50 && this.dVdt > 0) {
        this.inSpike = true;
        this.naAcc = 0;
      }
      if (this.inSpike) {
        if (extra > 0) this.naAcc += extra * DT;
        if (V < -60 && this.dVdt <= 0) {
          this.inSpike = false;
          if (this.naAcc > 50) this.lastSpikeIons = ionsFromCharge(this.naAcc);
        }
      }
      if (before < 0 && V >= 0) {
        this.spikes++;
        if (soundOn()) click();
        this.announce(`Spike number ${this.spikes}`, false, 600);
      }
      // "Predict, then watch" at threshold.
      if (
        this.predictEnabled &&
        before < -55 &&
        V >= -55 &&
        this.dVdt > 0 &&
        this.params.naBlock === 0 &&
        this.params.kBlock === 0 &&
        this.params.inactivationSlowing === 1
      ) {
        this.record(true);
        void this.ask(QUESTIONS.threshold);
        if (!this.playing) break;
      }
      this.record();
    }
    // Forget pulses that ended long ago.
    this.pulses = this.pulses.filter((p) => p.start + p.duration > this.s.t - WINDOW);
    this.phase = describePhase(this.s, this.dVdt, stimulusAt(this.s.t, this.pulses, this.holdOn ? this.holdAmp : 0) > 0, this.params);
    return this.s.t - t0;
  }

  private record(force = false) {
    if (!force && this.s.t - this.lastSampleT < SAMPLE_EVERY) return;
    const g = conductances(this.s, this.params);
    this.samples.push({
      t: this.s.t,
      V: this.s.V,
      gNa: g.gNa,
      gK: g.gK,
      stim: stimulusAt(this.s.t, this.pulses, this.holdOn ? this.holdAmp : 0) > 0,
    });
    this.lastSampleT = this.s.t;
    const cutoff = this.s.t - WINDOW - 1;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].t < cutoff) drop++;
    if (drop) this.samples.splice(0, drop);
  }

  // ---------- Channel state for drawing ----------

  private naGates(i: number) {
    const th = (i + 0.5) / N_NA;
    const mN = (this.s.m - GATE_REST.m) / (1 - GATE_REST.m);
    const hN = Math.max(0, (GATE_REST.h - this.s.h) / GATE_REST.h);
    const act = smoothstep(th - 0.12, th + 0.12, mN);
    const inact = smoothstep(th - 0.15, th + 0.15, hN);
    const open = act * (1 - inact) * (1 - this.params.naBlock);
    return { act, inact, open };
  }

  private kGate(i: number) {
    const th = (i + 0.5) / N_K;
    const nN = (this.s.n - GATE_REST.n) / (0.77 - GATE_REST.n);
    const act = smoothstep(th - 0.15, th + 0.15, nN);
    return { act, open: act * (1 - this.params.kBlock) };
  }

  private updateParticles(dtReal: number, modelMs: number) {
    if (this.reducedMotion) {
      this.particles = [];
      return;
    }
    const c = currents(this.s, this.params);
    const naRate = Math.min(70, Math.max(0, this.restINa - c.INa) * this.speed * 0.09);
    const kRate = Math.min(70, Math.max(0, c.IK - this.restIK) * this.speed * 0.09);
    this.spawnNa += naRate * dtReal;
    this.spawnK += kRate * dtReal;
    const naOpen = Array.from({ length: N_NA }, (_, i) => this.naGates(i).open);
    const kOpen = Array.from({ length: N_K }, (_, i) => this.kGate(i).open);
    const pick = (weights: number[]) => {
      const total = weights.reduce((a, b) => a + b, 0);
      if (total < 0.05) return -1;
      let r = Math.random() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    };
    while (this.spawnNa >= 1) {
      this.spawnNa -= 1;
      const ch = pick(naOpen);
      if (ch >= 0) this.particles.push({ kind: 'na', x: ch, p: 0, jitter: Math.random() - 0.5 });
    }
    while (this.spawnK >= 1) {
      this.spawnK -= 1;
      const ch = pick(kOpen);
      if (ch >= 0) this.particles.push({ kind: 'k', x: ch, p: 0, jitter: Math.random() - 0.5 });
    }
    for (const p of this.particles) p.p += dtReal / 0.7;
    this.particles = this.particles.filter((p) => p.p < 1);
    if (this.particles.length > 220) this.particles.splice(0, this.particles.length - 220);
    void modelMs;
  }

  // ---------- Drawing ----------

  private palette() {
    return readPalette(this, {
      bg: '--bg',
      surface: '--surface',
      surface2: '--surface-2',
      surface3: '--surface-3',
      border: '--border',
      text: '--text',
      muted: '--text-muted',
      faint: '--text-faint',
      na: '--ion-na',
      k: '--ion-k',
      accent: '--accent',
      membrane: '--membrane',
      membraneEdge: '--membrane-edge',
      trace: '--trace',
      grid: '--grid',
      bad: '--bad',
      mono: '--font-mono',
    });
  }

  protected render(): void {
    if (!this.membrane) return;
    const pal = this.palette();
    this.drawMembrane(pal);
    this.drawTrace(pal);
    const now = performance.now();
    if (now - this.lastReadout > 90 || !this.playing) {
      this.lastReadout = now;
      this.updateReadouts();
    }
  }

  private setCaption(text: string) {
    const el = this.$('.caption');
    if (el.textContent !== text) el.textContent = text;
  }

  private updateReadouts() {
    const g = conductances(this.s, this.params);
    this.$('.r-v').textContent = `${fmt(this.s.V, 1)} mV`;
    this.$('.r-gna').textContent = `${fmt(g.gNa, 2)} mS/cm²`;
    this.$('.r-gk').textContent = `${fmt(g.gK, 2)} mS/cm²`;
    this.$('.r-spikes').textContent = String(this.spikes);
    if (this.lastSpikeIons > 0) {
      const pct = squidInternalNaChange(this.lastSpikeIons) * 100;
      this.$('.r-ions').textContent = `≈ ${Math.round(this.lastSpikeIons / 1000).toLocaleString('en-GB')},000 per µm² (changes a squid axon’s inside Na⁺ by ${pct.toFixed(4)}%)`;
    }
    const text = this.pinnedCaption ?? phaseText[this.phase];
    this.setCaption(text);
    if (this.playing) this.announce(phaseText[this.phase]);
  }

  private drawMembrane(pal: ReturnType<ActionPotentialElement['palette']>) {
    const { w: W, h: H } = fitCanvas(this.membrane);
    const ctx = this.membrane.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const fontScale = this.hasAttribute('present') ? 1.25 : 1;
    const mono = `${Math.round(11 * fontScale)}px ${pal.mono || 'monospace'}`;

    const memTop = H * 0.43;
    const memBot = H * 0.59;
    const thick = memBot - memTop;

    // Region labels
    ctx.fillStyle = pal.faint;
    ctx.font = mono;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('OUTSIDE THE CELL', 10, 8);
    ctx.textBaseline = 'bottom';
    ctx.fillText('INSIDE THE CELL', 10, H - 8);

    // Background ions (seeded, so they stay put between frames)
    const rand = rng(7);
    const r = Math.max(3.2, Math.min(5.5, W / 90));
    const wiggle = this.reducedMotion ? 0 : 1;
    const drawCloud = (kind: 'na' | 'k', n: number, y0: number, y1: number, color: string) => {
      for (let i = 0; i < n; i++) {
        const x = 12 + rand() * (W - 24);
        const y = y0 + rand() * (y1 - y0);
        const ph = rand() * 6.28;
        const dx = wiggle * Math.sin(this.clock * 1.7 + ph) * 2.2;
        const dy = wiggle * Math.cos(this.clock * 1.3 + ph * 1.7) * 2.2;
        drawIon(ctx, kind, x + dx, y + dy, r, withAlpha(color, 0.55));
      }
    };
    drawCloud('na', 24, 26, memTop - 26, pal.na);
    drawCloud('k', 4, 26, memTop - 26, pal.k);
    drawCloud('k', 24, memBot + 26, H - 26, pal.k);
    drawCloud('na', 4, memBot + 26, H - 26, pal.na);

    // Lipid bilayer
    ctx.fillStyle = withAlpha(pal.membrane, 0.22);
    ctx.fillRect(0, memTop, W, thick);
    const headR = Math.max(2.5, thick * 0.11);
    ctx.fillStyle = withAlpha(pal.membrane, 0.85);
    for (let x = headR; x < W; x += headR * 2.3) {
      ctx.beginPath();
      ctx.arc(x, memTop + headR, headR, 0, Math.PI * 2);
      ctx.arc(x, memBot - headR, headR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = withAlpha(pal.membraneEdge, 0.6);
    ctx.lineWidth = 1;
    for (let x = headR; x < W; x += headR * 2.3) {
      ctx.beginPath();
      ctx.moveTo(x - 1, memTop + headR * 2);
      ctx.lineTo(x - 1, memTop + thick / 2 - 1);
      ctx.moveTo(x + 1, memBot - headR * 2);
      ctx.lineTo(x + 1, memTop + thick / 2 + 1);
      ctx.stroke();
    }

    // Charge on each face: inside negative at rest, positive at the peak
    const signs = Math.min(16, Math.round(Math.abs(this.s.V) / 5));
    const inside = this.s.V >= 0 ? '+' : '−';
    const outside = this.s.V >= 0 ? '−' : '+';
    ctx.font = `700 ${Math.round(13 * fontScale)}px ${pal.mono || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < signs; i++) {
      const x = ((i + 0.5) / signs) * W;
      ctx.fillStyle = withAlpha(pal.text, 0.75);
      ctx.fillText(outside, x, memTop - 10);
      ctx.fillText(inside, x, memBot + 10);
    }

    // Channels: Na, K, Na, K, Na, K
    const slots = N_NA + N_K;
    const cw = Math.min(58, W / (slots * 1.9));
    const labelFont = `700 ${Math.round(11 * fontScale)}px ${pal.mono || 'monospace'}`;
    const channelX: { na: number[]; k: number[] } = { na: [], k: [] };
    for (let i = 0; i < slots; i++) {
      const cx = ((i + 0.5) / slots) * W;
      const isNa = i % 2 === 0;
      const idx = Math.floor(i / 2);
      if (isNa) channelX.na.push(cx);
      else channelX.k.push(cx);
      const color = isNa ? pal.na : pal.k;
      const pore = cw * 0.3;
      const halfW = (cw - pore) / 2;
      const y0 = memTop - 8;
      const y1 = memBot + 8;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = pal.surface3;
      roundRect(ctx, cx - cw / 2, y0, halfW, y1 - y0, 6);
      ctx.fill();
      ctx.stroke();
      roundRect(ctx, cx + pore / 2, y0, halfW, y1 - y0, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = labelFont;
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(isNa ? 'Na⁺' : 'K⁺', cx, y0 - 16);

      if (isNa) {
        const g = this.naGates(idx);
        // Activation gate: a lid across the outer mouth that swings up as m rises
        const ang = g.act * 1.35;
        ctx.save();
        ctx.translate(cx - pore / 2, y0 + 2);
        ctx.rotate(-ang);
        ctx.strokeStyle = pal.text;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(pore, 0);
        ctx.stroke();
        ctx.restore();
        // Inactivation "ball and chain" on the inner side
        const restX = cx + cw / 2 + 6;
        const restY = y1 + 16;
        const plugX = cx;
        const plugY = y1 - 2;
        const bx = restX + (plugX - restX) * g.inact;
        const by = restY + (plugY - restY) * g.inact;
        ctx.strokeStyle = withAlpha(pal.text, 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + pore / 2 + halfW * 0.6, y1);
        ctx.quadraticCurveTo(cx + cw / 2 + 4, y1 + 10, bx, by);
        ctx.stroke();
        ctx.fillStyle = pal.text;
        ctx.beginPath();
        ctx.arc(bx, by, pore * 0.42, 0, Math.PI * 2);
        ctx.fill();
        if (this.params.inactivationSlowing > 1) this.pill(ctx, 'ATX', bx + 14, by + 10, pal, fontScale);
        if (this.params.naBlock > 0) this.pill(ctx, 'TTX', cx, y0 - 2, pal, fontScale);
      } else {
        const g = this.kGate(idx);
        // A single gate on the inner side that swings down as n rises
        const ang = g.act * 1.35;
        ctx.save();
        ctx.translate(cx - pore / 2, y1 - 2);
        ctx.rotate(ang);
        ctx.strokeStyle = pal.text;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(pore, 0);
        ctx.stroke();
        ctx.restore();
        if (this.params.kBlock > 0) this.pill(ctx, 'TEA', cx, y1 + 4, pal, fontScale);
      }
    }

    // Ions moving through open channels
    const pathTop = memTop - 34;
    const pathBot = memBot + 34;
    if (!this.reducedMotion) {
      for (const p of this.particles) {
        const cx = p.kind === 'na' ? channelX.na[p.x] : channelX.k[p.x];
        const t = p.p;
        const y = p.kind === 'na' ? pathTop + (pathBot - pathTop) * t : pathBot - (pathBot - pathTop) * t;
        const spread = (1 - Math.abs(t - 0.5) * 2) < 0.6 ? cw * 0.9 : 0;
        const x = cx + p.jitter * spread;
        const alpha = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
        drawIon(ctx, p.kind, x, y, r * 1.05, withAlpha(p.kind === 'na' ? pal.na : pal.k, alpha));
      }
    } else {
      // Still frames: arrows whose width shows the current
      const c = currents(this.s, this.params);
      const naI = Math.max(0, this.restINa - c.INa);
      const kI = Math.max(0, c.IK - this.restIK);
      channelX.na.forEach((cx, i) => {
        const o = this.naGates(i).open;
        if (o * naI > 5) this.arrow(ctx, cx, pathTop, pathBot, Math.min(8, 1 + (o * naI) / 60), pal.na);
      });
      channelX.k.forEach((cx, i) => {
        const o = this.kGate(i).open;
        if (o * kI > 5) this.arrow(ctx, cx, pathBot, pathTop, Math.min(8, 1 + (o * kI) / 30), pal.k);
      });
    }

    // Voltmeter badge
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(15 * fontScale)}px ${pal.mono || 'monospace'}`;
    ctx.fillStyle = pal.text;
    ctx.fillText(`${fmt(this.s.V, 0)} mV`, W - 10, 8);
    ctx.font = mono;
    ctx.fillStyle = pal.faint;
    ctx.fillText('inside vs outside', W - 10, 8 + 18 * fontScale);
  }

  private pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, pal: { text: string; bg: string; mono: string }, scale: number) {
    ctx.font = `700 ${Math.round(9.5 * scale)}px ${pal.mono || 'monospace'}`;
    const w = ctx.measureText(text).width + 8;
    const h = 14 * scale;
    ctx.fillStyle = pal.text;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = pal.bg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }

  private arrow(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, width: number, color: string) {
    const dir = Math.sign(y1 - y0);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1 - dir * 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 7 - width / 2, y1 - dir * 12);
    ctx.lineTo(x + 7 + width / 2, y1 - dir * 12);
    ctx.lineTo(x, y1);
    ctx.closePath();
    ctx.fill();
  }

  private drawTrace(pal: ReturnType<ActionPotentialElement['palette']>) {
    const { w: W, h: H } = fitCanvas(this.trace);
    const ctx = this.trace.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const fontScale = this.hasAttribute('present') ? 1.25 : 1;
    const small = `${Math.round(10.5 * fontScale)}px ${pal.mono || 'monospace'}`;
    const L = 48 * fontScale;
    const R = 14;
    const T = 14;
    const B = 26 * fontScale;
    const gap = 16;
    const plotH = H - T - B - gap;
    const vH = plotH * 0.64;
    const gH = plotH - vH;
    const vTop = T;
    const gTop = T + vH + gap;
    const x0 = L;
    const x1 = W - R;
    const tNow = this.s.t;
    const tMin = tNow - WINDOW;
    const X = (t: number) => x0 + ((t - tMin) / WINDOW) * (x1 - x0);
    const vMin = -100;
    const vMax = 60;
    const Y = (v: number) => vTop + (1 - (v - vMin) / (vMax - vMin)) * vH;
    let gMax = 35;
    for (const s of this.samples) gMax = Math.max(gMax, s.gNa * 1.05, s.gK * 1.05);
    gMax = Math.ceil(gMax / 10) * 10;
    const G = (g: number) => gTop + (1 - g / gMax) * gH;
    const narrow = W < 460;

    // Grid and axes
    ctx.font = small;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    for (let v = -80; v <= 40; v += 40) {
      ctx.beginPath();
      ctx.moveTo(x0, Y(v));
      ctx.lineTo(x1, Y(v));
      ctx.stroke();
      ctx.fillStyle = pal.muted;
      ctx.fillText(v > 0 ? `+${v}` : fmt(v, 0), x0 - 6, Y(v));
    }
    ctx.save();
    ctx.translate(12, vTop + vH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('mV', 0, 0);
    ctx.restore();

    // Reference lines
    const ref = (v: number, color: string, label: string, dash: number[]) => {
      ctx.strokeStyle = withAlpha(color, 0.8);
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(x0, Y(v));
      ctx.lineTo(x1, Y(v));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, x1 - 2, Y(v) - 2);
    };
    ref(this.params.ENa, pal.na, narrow ? 'E_Na +50 mV' : 'E_Na +50 mV: where Na⁺ stops flowing', [6, 4]);
    ref(this.params.EK, pal.k, 'E_K −77 mV', [6, 4]);
    ref(-55, pal.faint, '≈ threshold', [2, 3]);

    // Stimulus marks
    ctx.fillStyle = withAlpha(pal.accent, 0.85);
    for (const s of this.samples) if (s.stim && s.t >= tMin) ctx.fillRect(X(s.t), vTop + vH - 5, Math.max(1.5, ((x1 - x0) * SAMPLE_EVERY) / WINDOW), 5);

    // Voltage trace
    const pts = this.samples.filter((s) => s.t >= tMin - SAMPLE_EVERY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, vTop - 4, x1 - x0, vH + 8);
    ctx.clip();
    ctx.strokeStyle = pal.trace;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((s, i) => (i ? ctx.lineTo(X(s.t), Y(s.V)) : ctx.moveTo(X(s.t), Y(s.V))));
    ctx.stroke();
    ctx.restore();
    if (pts.length) {
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(X(tNow), Y(this.s.V), 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Conductance panel
    ctx.strokeStyle = pal.grid;
    ctx.beginPath();
    ctx.moveTo(x0, G(0));
    ctx.lineTo(x1, G(0));
    ctx.moveTo(x0, G(gMax));
    ctx.lineTo(x1, G(gMax));
    ctx.stroke();
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('0', x0 - 6, G(0));
    ctx.fillText(String(gMax), x0 - 6, G(gMax));
    ctx.save();
    ctx.translate(12, gTop + gH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('mS/cm²', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, gTop - 2, x1 - x0, gH + 4);
    ctx.clip();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.na;
    ctx.beginPath();
    pts.forEach((s, i) => (i ? ctx.lineTo(X(s.t), G(s.gNa)) : ctx.moveTo(X(s.t), G(s.gNa))));
    ctx.stroke();
    ctx.strokeStyle = pal.k;
    ctx.setLineDash([7, 4]);
    ctx.beginPath();
    pts.forEach((s, i) => (i ? ctx.lineTo(X(s.t), G(s.gK)) : ctx.moveTo(X(s.t), G(s.gK))));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = pal.na;
    ctx.fillText('g_Na', x0 + 6, gTop + 2);
    ctx.fillStyle = pal.k;
    ctx.fillText('g_K', x0 + 52 * fontScale, gTop + 2);

    // Time axis
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let k = 0; k <= WINDOW; k += narrow ? 10 : 5) {
      const x = X(tMin + k);
      ctx.strokeStyle = pal.grid;
      ctx.beginPath();
      ctx.moveTo(x, gTop + gH);
      ctx.lineTo(x, gTop + gH + 4);
      ctx.stroke();
      ctx.fillText(k === WINDOW ? 'now' : `−${WINDOW - k} ms`, x, gTop + gH + 7);
    }
  }
}

if (!customElements.get('nc-action-potential')) customElements.define('nc-action-potential', ActionPotentialElement);
