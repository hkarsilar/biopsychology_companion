import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { fitCanvas, readPalette, withAlpha } from '../shared/canvas';
import { SUM, SummationModel, defaultSumParams, pattern, simulate, type InputKind, type ScheduledInput } from './model';

/**
 * <nc-summation>: place excitatory and inhibitory synapses on a neuron, fire them by hand or
 * in a timed pattern, and watch the voltage at the axon hillock.
 *
 * Attributes: preset, sites ("A1e,B1e,Si"), repeats, gap, tau, lambda, speed, predict,
 * present, lab-href.
 */

type Branch = 'soma' | 'a' | 'b' | 'c';
type Tool = 'fire' | 'exc' | 'inh' | 'remove';

export interface Site {
  id: string;
  branch: Branch;
  /** Distance from the cell body (µm) */
  distance: number;
}

/** Synapse slots on the neuron. The index is the site number the model uses. */
export const SITES: Site[] = [
  { id: 'S', branch: 'soma', distance: 0 },
  { id: 'A1', branch: 'a', distance: 80 },
  { id: 'A2', branch: 'a', distance: 220 },
  { id: 'A3', branch: 'a', distance: 400 },
  { id: 'B1', branch: 'b', distance: 100 },
  { id: 'B2', branch: 'b', distance: 260 },
  { id: 'C1', branch: 'c', distance: 150 },
  { id: 'C2', branch: 'c', distance: 330 },
];

const BRANCH_ANGLE: Record<Exclude<Branch, 'soma'>, number> = {
  a: (-142 * Math.PI) / 180,
  c: (-92 * Math.PI) / 180,
  b: (-38 * Math.PI) / 180,
};
const SOMA_ANGLE = (152 * Math.PI) / 180;
const BRANCH_LENGTH = 440;

interface SumPreset {
  sites: Record<string, InputKind>;
  repeats?: number;
  gap?: number;
  tau?: number;
  lambda?: number;
  /** Fire the pattern straight away */
  fire?: boolean;
  /** Or fire these sites at these times (ms from now) */
  sequence?: { site: string; t: number }[];
  tool?: Tool;
  caption: string;
}

export const SUMMATION_PRESETS: Record<string, SumPreset> = {
  free: {
    sites: {},
    tool: 'exc',
    caption: 'Click an empty circle to place a synapse. Then choose Fire it and click a synapse, or press Fire pattern.',
  },
  single: {
    sites: { A1: 'exc' },
    fire: true,
    caption: 'One synapse, one EPSP. It lifts the hillock by about 9 mV and fades within about 50 ms. Threshold is 15 mV above rest, so one EPSP is not enough.',
  },
  spatial: {
    sites: { A1: 'exc', B1: 'exc' },
    fire: true,
    caption: 'Two synapses on different branches fire at the same moment. Their EPSPs add up at the hillock and reach threshold: spatial summation.',
  },
  temporal: {
    sites: { A1: 'exc' },
    repeats: 3,
    gap: 5,
    fire: true,
    caption: 'One synapse fires three times, 5 ms apart. Each EPSP starts before the last one has faded, so they pile up: temporal summation.',
  },
  'temporal-slow': {
    sites: { A1: 'exc' },
    repeats: 3,
    gap: 30,
    fire: true,
    caption: 'The same synapse fires three times, but 30 ms apart. Each EPSP has mostly faded before the next one arrives, so they never reach threshold.',
  },
  distance: {
    sites: { S: 'exc', A3: 'exc' },
    sequence: [
      { site: 'S', t: 2 },
      { site: 'A3', t: 40 },
    ],
    caption: 'Two synapses of the same strength fire one after the other: first on the cell body, then 400 µm out on a dendrite. The distant EPSP arrives smaller, later and more spread out.',
  },
  veto: {
    sites: { A1: 'exc', B1: 'exc', S: 'inh' },
    fire: true,
    caption: 'The same two EPSPs that fired the cell before, plus one inhibitory synapse on the cell body. The IPSP vetoes the excitation: no spike.',
  },
  'far-inhibition': {
    sites: { A1: 'exc', B1: 'exc', A3: 'inh' },
    fire: true,
    caption: 'Now the inhibitory synapse sits 400 µm out on a dendrite. Its effect fades on the way to the hillock, so it cannot stop the spike.',
  },
  'and-gate': {
    sites: { A1: 'exc', B1: 'exc' },
    tool: 'fire',
    caption: 'Fire A1 on its own, then B1 on its own, then both together (Fire pattern). Only both together reach threshold. This neuron is an AND gate.',
  },
  'length-constant': {
    sites: { A3: 'exc', B2: 'exc', C2: 'exc' },
    lambda: 800,
    fire: true,
    caption: 'Three distant synapses, with a long length constant of 800 µm. Little is lost on the way, so together they reach threshold. Now try λ = 300 µm.',
  },
  'time-constant': {
    sites: { A1: 'exc' },
    repeats: 3,
    gap: 8,
    tau: 5,
    fire: true,
    caption: 'Three EPSPs, 8 ms apart, with a short time constant of 5 ms. Each one fades before the next arrives. Now try τ = 30 ms.',
  },
};

const SPEEDS = [5, 10, 20, 50];
const WINDOW = 100;

interface Sample {
  t: number;
  v: number;
}

interface Part {
  kind: InputKind;
  site: number;
  /** When the synapse fired */
  t: number;
  /** Flat list of (time, own PSP) pairs */
  pts: number[];
}

interface Round {
  inputs: ScheduledInput[];
  peak: number;
  trough: number;
  spikes: number;
}

export class SummationElement extends SimElement {
  private model = new SummationModel(defaultSumParams);
  private layout = new Map<number, InputKind>();
  private tool: Tool = 'fire';
  private repeats = 1;
  private gap = 5;
  private speed = 20;
  private showParts = true;
  private samples: Sample[] = [];
  private parts = new Map<number, Part>();
  private lastSample = -Infinity;
  private round: Round | null = null;
  private idleSince = 0;
  private flashes = new Map<number, number>();
  private axonSpikes: number[] = [];
  private clock = 0;
  private totalSpikes = 0;
  private lastPeak: number | null = null;
  private pinned: string | null = null;
  private lastSize = '';

  private board!: HTMLCanvasElement;
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
        .board-wrap { position: relative; }
        .sites { position: absolute; inset: 0; pointer-events: none; }
        .site {
          position: absolute; transform: translate(-50%, -50%); pointer-events: auto;
          width: 2.15rem; height: 2.15rem; min-width: 0; min-height: 0; padding: 0; border-radius: 50%;
          font: 700 1.05rem/1 var(--font-mono, monospace);
          border: 2px dashed var(--border-strong); background: var(--surface); color: var(--text-faint);
        }
        :host([present]) .site { width: 2.6rem; height: 2.6rem; }
        @container (max-width: 520px) {
          .site { width: 1.8rem; height: 1.8rem; font-size: 0.95rem; }
        }
        .site.exc { border: 2px solid var(--excite); background: color-mix(in srgb, var(--excite) 28%, var(--surface)); color: var(--text); }
        .site.inh { border: 2px solid var(--inhibit); background: color-mix(in srgb, var(--inhibit) 28%, var(--surface)); color: var(--text); }
        .site.flash { box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 45%, transparent); }
        .seg { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.35rem; }
        .seg label { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.7rem; border: 1px solid var(--border-strong); border-radius: 999px; cursor: pointer; font-size: 0.92em; background: var(--surface-2); }
        .seg input { accent-color: var(--accent); margin: 0; }
        .seg label:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); font-weight: 600; }
        .seg label:has(input:focus-visible) { outline: 3px solid var(--focus); outline-offset: 2px; }
        .sum-controls { grid-template-columns: repeat(auto-fit, minmax(15.5rem, 1fr)); align-items: start; }
        .note.tight { margin: 0.4rem 0 0; }
        @container (min-width: 760px) {
          canvas.board { aspect-ratio: 1 / 0.92 !important; }
          canvas.trace { aspect-ratio: 1 / 0.74 !important; }
        }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Summation board<small>Synapses on a neuron, and the voltage at its axon hillock</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Play"><span aria-hidden="true">▶</span> <span class="lbl">Play</span></button>
            <button class="reset" type="button" aria-label="Clear the trace" title="Clear the trace">↺</button>
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
            <div class="board-wrap">
              <canvas class="board" style="aspect-ratio: 1 / 0.95" role="img" aria-label="A neuron with a cell body, three dendrites and an axon. Circles mark places where synapses can sit."></canvas>
              <div class="sites" role="group" aria-label="Synapse sites on the neuron">
                ${SITES.map((s, i) => `<button type="button" class="site" data-i="${i}"><span aria-hidden="true"></span></button>`).join('')}
              </div>
            </div>
            <figcaption>
              <span class="legend">
                <span><i class="round" style="background: var(--excite)"></i>+ excitatory</span>
                <span><i class="round" style="background: var(--inhibit)"></i>− inhibitory</span>
                <span><i class="line" style="background: var(--accent)"></i>λ, the length constant</span>
                <span>Rings every 100 µm from the cell body</span>
              </span>
            </figcaption>
          </figure>
          <figure>
            <canvas class="trace" style="aspect-ratio: 16 / 13" role="img" aria-label="Voltage at the axon hillock over time, with the threshold line"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="line" style="background: var(--trace)"></i>Hillock voltage (the sum)</span>
                <span class="parts-key"><i class="line" style="background: var(--excite)"></i><i class="line" style="background: var(--inhibit)"></i>Each input on its own</span>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="readouts" role="group" aria-label="Readouts">
          <span><b>Hillock now</b><span class="r-v"></span></span>
          <span><b>Highest, last round</b><span class="r-peak">—</span></span>
          <span><b>Spikes</b><span class="r-spikes">0</span></span>
        </div>
        <div class="controls sum-controls">
          <fieldset>
            <legend>Clicking a synapse will…</legend>
            <div class="seg" role="radiogroup" aria-label="Clicking a synapse will">
              <label><input type="radio" name="tool" value="fire" />Fire it</label>
              <label><input type="radio" name="tool" value="exc" />Make it excitatory (+)</label>
              <label><input type="radio" name="tool" value="inh" />Make it inhibitory (−)</label>
              <label><input type="radio" name="tool" value="remove" />Remove it</label>
            </div>
            <div class="row">
              <button class="clear" type="button">Remove all synapses</button>
            </div>
          </fieldset>
          <fieldset>
            <legend>Fire a pattern</legend>
            <div class="row">
              <button class="fire primary" type="button"><span aria-hidden="true">⚡</span> Fire pattern</button>
            </div>
            <p class="note tight pattern-note"></p>
            <div class="slider">
              <label for="repeats">Times each synapse fires</label>
              <input id="repeats" class="repeats" type="range" min="1" max="5" step="1" />
              <output class="o-repeats"></output>
            </div>
            <div class="slider">
              <label for="gap">Gap between repeats</label>
              <input id="gap" class="gap" type="range" min="2" max="40" step="1" />
              <output class="o-gap"></output>
            </div>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Guess whether the cell will fire before each pattern</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Membrane</legend>
            <div class="slider">
              <label for="tau">Time constant τ: how slowly a PSP fades</label>
              <input id="tau" class="tau" type="range" min="2" max="40" step="1" />
              <output class="o-tau"></output>
            </div>
            <div class="slider">
              <label for="lambda">Length constant λ: how far a PSP spreads</label>
              <input id="lambda" class="lambda" type="range" min="50" max="1000" step="10" />
              <output class="o-lambda"></output>
            </div>
            <label class="toggle"><input type="checkbox" class="parts" /><span>Show each input on its own<small>Thin lines under the sum</small></span></label>
          </fieldset>
        </div>
        <div class="row">
          <button class="png" type="button">Save PNG</button>
          <button class="link" type="button">Copy link</button>
        </div>
        <p class="keys">Keys: <kbd>Space</kbd> play or pause · <kbd>F</kbd> fire pattern · <kbd>R</kbd> clear the trace</p>
      </div>`);

    this.board = this.$('.board') as HTMLCanvasElement;
    this.trace = this.$('.trace') as HTMLCanvasElement;

    const attr = (n: string) => this.getAttribute(n);
    const preset = SUMMATION_PRESETS[attr('preset') ?? ''] ? (attr('preset') as string) : null;
    const sites = attr('sites');
    this.setPreset(preset ?? (sites ? 'free' : 'single'), false);
    if (sites !== null) {
      this.layout = parseSites(sites);
      this.pinned = null;
    }
    const num = (n: string, lo: number, hi: number) => {
      const v = Number(attr(n));
      return attr(n) !== null && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null;
    };
    this.repeats = Math.round(num('repeats', 1, 5) ?? this.repeats);
    this.gap = Math.round(num('gap', 2, 40) ?? this.gap);
    this.model.params.tauM = num('tau', 2, 40) ?? this.model.params.tauM;
    this.model.params.lambda = num('lambda', 50, 1000) ?? this.model.params.lambda;
    const sp = Number(attr('speed'));
    if (SPEEDS.includes(sp)) this.speed = sp;
    if (sites !== null && this.layout.size) this.tool = 'fire';

    this.wire();
    this.syncControls();
    this.record(true);
    this.setCaption(this.pinned ?? this.idleCaption());
    const p = preset ? SUMMATION_PRESETS[preset] : null;
    if (p && (p.fire || p.sequence) && sites === null) requestAnimationFrame(() => this.runPreset(p));
  }

  /** Apply a named preset, e.g. from a "Try this" button in a lesson. */
  applyPreset(name: string, start = true): void {
    this.setPreset(name, true);
    if (!this.board) return;
    this.syncControls();
    this.setCaption(this.pinned ?? this.idleCaption());
    const p = SUMMATION_PRESETS[name];
    if (start && p && (p.fire || p.sequence)) this.runPreset(p);
    this.render();
  }

  private setPreset(name: string, clear: boolean) {
    const p = SUMMATION_PRESETS[name] ?? SUMMATION_PRESETS.single;
    this.layout = new Map();
    for (const [id, kind] of Object.entries(p.sites)) {
      const i = SITES.findIndex((s) => s.id === id);
      if (i >= 0) this.layout.set(i, kind);
    }
    this.repeats = p.repeats ?? 1;
    this.gap = p.gap ?? 5;
    this.model.params.tauM = p.tau ?? defaultSumParams.tauM;
    this.model.params.lambda = p.lambda ?? defaultSumParams.lambda;
    this.tool = p.tool ?? 'fire';
    this.pinned = p.caption;
    if (clear) {
      this.pause();
      this.clearTrace();
    }
  }

  private runPreset(p: SumPreset) {
    if (p.sequence) {
      const now = this.model.t;
      for (const s of p.sequence) {
        const i = SITES.findIndex((x) => x.id === s.site);
        const kind = this.layout.get(i);
        if (i >= 0 && kind) this.addInput(i, kind, now + s.t);
      }
      this.go();
    } else if (p.fire) {
      void this.firePattern(false);
    }
  }

  private idleCaption(): string {
    if (!this.layout.size) return 'No synapses yet. Choose Make it excitatory, then click a circle on the neuron.';
    return this.tool === 'fire'
      ? 'Click a synapse to fire it, or press Fire pattern to fire every synapse together.'
      : 'Click circles on the neuron to change the synapses, then press Fire pattern.';
  }

  // ---------- Controls ----------

  private syncControls() {
    this.root.querySelectorAll<HTMLInputElement>('input[name="tool"]').forEach((r) => (r.checked = r.value === this.tool));
    (this.$('.repeats') as HTMLInputElement).value = String(this.repeats);
    (this.$('.gap') as HTMLInputElement).value = String(this.gap);
    (this.$('.tau') as HTMLInputElement).value = String(this.model.params.tauM);
    (this.$('.lambda') as HTMLInputElement).value = String(this.model.params.lambda);
    (this.$('.speed') as HTMLSelectElement).value = String(this.speed);
    (this.$('.predict') as HTMLInputElement).checked = this.predictEnabled;
    (this.$('.parts') as HTMLInputElement).checked = this.showParts;
    (this.$('.parts-key') as HTMLElement).hidden = !this.showParts;
    this.updateOutputs();
    this.updateSites();
  }

  private updateOutputs() {
    this.$('.o-repeats').textContent = this.repeats === 1 ? 'once' : `${this.repeats} times`;
    this.$('.o-gap').textContent = `${this.gap} ms`;
    (this.$('.gap') as HTMLInputElement).disabled = this.repeats === 1;
    this.$('.o-tau').textContent = `${fmt(this.model.params.tauM, 0)} ms`;
    this.$('.o-lambda').textContent = `${fmt(this.model.params.lambda, 0)} µm`;
    this.$('.timescale').textContent = `Slowed ${Math.round(1000 / this.speed)}×`;
    const n = this.layout.size;
    this.$('.pattern-note').textContent =
      n === 0
        ? 'Place at least one synapse first.'
        : `${n === 1 ? 'Fires the synapse' : `Fires all ${n} synapses together`}${this.repeats > 1 ? `, ${this.repeats} times, ${this.gap} ms apart` : ', once'}.`;
    (this.$('.fire') as HTMLButtonElement).disabled = n === 0;
  }

  private siteLabel(i: number): string {
    const s = SITES[i];
    const where = s.distance === 0 ? 'on the cell body' : `${s.distance} µm from the cell body`;
    const kind = this.layout.get(i);
    const what = kind === 'exc' ? 'excitatory synapse' : kind === 'inh' ? 'inhibitory synapse' : 'empty';
    const action =
      this.tool === 'fire' ? (kind ? 'Fire it' : 'Nothing to fire') : this.tool === 'exc' ? 'Make it excitatory' : this.tool === 'inh' ? 'Make it inhibitory' : 'Remove it';
    return `${s.id}, ${where}: ${what}. ${action}.`;
  }

  private updateSites() {
    this.root.querySelectorAll<HTMLButtonElement>('.site').forEach((b) => {
      const i = Number(b.dataset.i);
      const kind = this.layout.get(i);
      b.classList.toggle('exc', kind === 'exc');
      b.classList.toggle('inh', kind === 'inh');
      b.querySelector('span')!.textContent = kind === 'exc' ? '+' : kind === 'inh' ? '−' : '';
      b.setAttribute('aria-label', this.siteLabel(i));
      b.title = `${SITES[i].id}: ${SITES[i].distance} µm`;
    });
  }

  private placeSites(W: number, H: number) {
    const g = this.geom(W, H);
    this.root.querySelectorAll<HTMLButtonElement>('.site').forEach((b) => {
      const p = g.site[Number(b.dataset.i)];
      b.style.left = `${(p.x / W) * 100}%`;
      b.style.top = `${(p.y / H) * 100}%`;
    });
  }

  private wire() {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => this.toggle());
    on('.reset', 'click', () => {
      this.pause();
      this.clearTrace();
      this.pinned = null;
      this.setCaption(this.idleCaption());
      this.render();
    });
    on('.speed', 'change', (e) => {
      this.speed = Number((e.target as HTMLSelectElement).value);
      this.updateOutputs();
    });
    this.root.querySelectorAll<HTMLInputElement>('input[name="tool"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.tool = r.value as Tool;
        this.updateSites();
        if (!this.round) this.setCaption(this.idleCaption());
      }),
    );
    on('.clear', 'click', () => {
      this.layout.clear();
      this.tool = 'exc';
      this.pinned = null;
      this.syncControls();
      this.setCaption(this.idleCaption());
      this.announce('All synapses removed', true);
      this.render();
    });
    this.root.querySelectorAll<HTMLButtonElement>('.site').forEach((b) => b.addEventListener('click', () => this.clickSite(Number(b.dataset.i))));
    on('.fire', 'click', () => void this.firePattern(true));
    on('.repeats', 'input', (e) => {
      this.repeats = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.gap', 'input', (e) => {
      this.gap = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.tau', 'input', (e) => {
      this.model.params.tauM = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.lambda', 'input', (e) => {
      this.model.params.lambda = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
      this.render();
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.parts', 'change', (e) => {
      this.showParts = (e.target as HTMLInputElement).checked;
      (this.$('.parts-key') as HTMLElement).hidden = !this.showParts;
      this.render();
    });
    on('.png', 'click', () => this.savePng([this.board, this.trace], 'Summation board', 'summation.png'));
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'INPUT') {
        e.preventDefault();
        this.toggle();
      } else if ((e.key === 'f' || e.key === 'F') && tag !== 'SELECT') {
        void this.firePattern(true);
      } else if ((e.key === 'r' || e.key === 'R') && tag !== 'SELECT') {
        this.pause();
        this.clearTrace();
        this.render();
      }
    });
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
  }

  protected onPlayState(): void {
    const b = this.root.querySelector('.play');
    if (!b) return;
    b.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    b.querySelector('span[aria-hidden]')!.textContent = this.playing ? '❚❚' : '▶';
    b.querySelector('.lbl')!.textContent = this.playing ? 'Pause' : 'Play';
  }

  private clickSite(i: number) {
    const kind = this.layout.get(i);
    const id = SITES[i].id;
    if (this.tool === 'fire') {
      if (!kind) {
        this.setCaption(`There is no synapse at ${id} yet. Choose Make it excitatory or Make it inhibitory first.`);
        this.announce(`No synapse at ${id}`, true);
        return;
      }
      this.pinned = null;
      this.addInput(i, kind, this.model.t + 0.2);
      this.announce(`${id} fired`, true);
      this.go();
      return;
    }
    if (this.tool === 'remove') this.layout.delete(i);
    else this.layout.set(i, this.tool);
    this.pinned = null;
    this.updateSites();
    this.updateOutputs();
    const now = this.layout.get(i);
    const msg = now ? `${id} is now ${now === 'exc' ? 'excitatory' : 'inhibitory'}` : `${id} removed`;
    this.setCaption(`${msg}. ${this.idleCaption()}`);
    this.announce(msg, true);
    this.render();
  }

  private placed() {
    return [...this.layout.entries()].map(([site, kind]) => ({ site, kind, distance: SITES[site].distance }));
  }

  private async firePattern(ask: boolean) {
    const placed = this.placed();
    if (!placed.length) {
      this.setCaption(this.idleCaption());
      return;
    }
    if (ask && this.predictEnabled) await this.ask(this.fireQuestion());
    const start = this.model.t + 2;
    for (const p of pattern(placed, this.repeats, this.gap, start)) this.addInput(p.site, p.kind, p.t);
    if (ask) this.pinned = null;
    this.announce('Pattern fired', true);
    this.go();
  }

  private fireQuestion(): PredictQuestion {
    const placed = this.placed();
    const r = simulate(pattern(placed, this.repeats, this.gap, 2), this.model.params, 40 + this.repeats * this.gap + 5 * this.model.params.tauM);
    const fires = r.spikes > 0;
    const short = SUM.threshold - r.peak;
    const key = placed.map((p) => `${SITES[p.site].id}${p.kind[0]}`).join('');
    return {
      id: `fire-${key}-${this.repeats}-${this.gap}-${this.model.params.tauM}-${this.model.params.lambda}`,
      question: 'When this pattern fires, will the axon hillock reach threshold (−55 mV)?',
      options: ['Yes, the cell will fire.', 'No, it will stay below threshold.'],
      correct: fires ? 0 : 1,
      explain: fires
        ? `It fires${r.spikes > 1 ? ` ${r.spikes} spikes` : ''}: the inputs add up to the 15 mV needed to get from rest (−70 mV) to threshold.`
        : r.peak <= SUM.vRest + 0.05
          ? 'It stays below threshold: inhibition only moves the hillock further away from it.'
          : `It stays below threshold: the hillock gets to ${fmt(r.peak, 1)} mV, ${fmt(short, 1)} mV short.`,
    };
  }

  private addInput(site: number, kind: InputKind, t: number) {
    const input = this.model.trigger(site, SITES[site].distance, kind, t);
    if (!this.round) this.round = { inputs: [], peak: this.model.v, trough: this.model.v, spikes: 0 };
    this.round.inputs.push(input);
    this.parts.set(input.id, { kind, site, t, pts: [] });
  }

  /** Start time running; with reduced motion, jump straight to the end of the round. */
  private go() {
    if (this.reducedMotion) {
      this.pause();
      let guard = 0;
      while ((this.model.active() || this.pendingInputs()) && guard++ < 4000) this.advance(0.5);
      this.advance(5);
      this.render();
      return;
    }
    this.idleSince = 0;
    if (!this.playing) this.play();
  }

  /** The round is over: nothing left to arrive and the hillock is back near rest. */
  private settled(): boolean {
    if (this.pendingInputs()) return false;
    const m = this.model;
    const lastPeak = Math.max(...m.inputs.map((i) => i.arrive + peakTime(i.rise, i.decay)), -Infinity);
    return m.t > lastPeak + 2 && Math.abs(m.v - SUM.vRest) < 0.6 && m.inputs.every((i) => Math.abs(i.alone) < 0.6);
  }

  private pendingInputs(): boolean {
    return this.model.inputs.some((i) => i.t > this.model.t);
  }

  private clearTrace() {
    this.model.reset();
    this.samples = [];
    this.parts.clear();
    this.lastSample = -Infinity;
    this.round = null;
    this.flashes.clear();
    this.axonSpikes = [];
    this.totalSpikes = 0;
    this.lastPeak = null;
    this.record(true);
    this.updateReadouts();
  }

  private async copyLink() {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    u.searchParams.set('sites', [...this.layout.entries()].map(([i, k]) => `${SITES[i].id}${k === 'exc' ? 'e' : 'i'}`).join(','));
    if (this.repeats > 1) {
      u.searchParams.set('repeats', String(this.repeats));
      u.searchParams.set('gap', String(this.gap));
    }
    if (this.model.params.tauM !== defaultSumParams.tauM) u.searchParams.set('tau', String(this.model.params.tauM));
    if (this.model.params.lambda !== defaultSumParams.lambda) u.searchParams.set('lambda', String(this.model.params.lambda));
    const btn = this.$('.link');
    try {
      await navigator.clipboard.writeText(u.toString());
      btn.textContent = 'Link copied';
    } catch {
      prompt('Copy this link:', u.toString());
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
  }

  // ---------- Time ----------

  reset(): void {
    this.clearTrace();
  }

  stepOnce(): void {
    this.advance(1);
    this.render();
  }

  protected tick(dtReal: number): void {
    this.clock += dtReal;
    this.advance(Math.min(dtReal * this.speed, 50));
    for (const [k, age] of this.flashes) {
      if (age + dtReal > 0.45) this.flashes.delete(k);
      else this.flashes.set(k, age + dtReal);
    }
    this.axonSpikes = this.axonSpikes.map((a) => a + dtReal).filter((a) => a < 0.6);
    // Stop once everything has faded, leaving the trace on screen.
    if (this.settled()) {
      this.idleSince += dtReal * this.speed;
      if (this.idleSince > 15) this.pause();
    } else this.idleSince = 0;
  }

  private advance(ms: number) {
    const slice = 0.1;
    const n = Math.max(1, Math.round(ms / slice));
    for (let k = 0; k < n; k++) {
      const t0 = this.model.t;
      for (const i of this.model.inputs) if (i.t > t0 && i.t <= t0 + ms / n) this.flashSite(i.site);
      const events = this.model.advance(ms / n);
      for (const e of events) {
        if (e.type !== 'spike') continue;
        this.samples.push({ t: e.t, v: SUM.threshold }, { t: e.t + 0.01, v: SUM.spikePeak }, { t: e.t + 0.4, v: SUM.reset });
        this.totalSpikes++;
        if (this.round) this.round.spikes++;
        this.axonSpikes.push(0);
        this.announce('The axon hillock reached threshold: spike!', true);
      }
      if (this.round) {
        this.round.peak = Math.max(this.round.peak, this.model.v);
        this.round.trough = Math.min(this.round.trough, this.model.v);
      }
      this.record();
      if (this.round && this.settled()) this.endRound();
    }
  }

  private flashSite(site: number) {
    this.flashes.set(site, 0);
    const b = this.root.querySelector(`.site[data-i="${site}"]`);
    if (b && !this.reducedMotion) {
      b.classList.add('flash');
      setTimeout(() => b.classList.remove('flash'), 220);
    }
  }

  private record(force = false) {
    const m = this.model;
    if (!force && m.t - this.lastSample < 0.2) return;
    this.samples.push({ t: m.t, v: m.v });
    for (const i of m.inputs) {
      const p = this.parts.get(i.id);
      if (p && m.t >= i.arrive) p.pts.push(m.t, i.alone);
    }
    this.lastSample = m.t;
    const cutoff = m.t - WINDOW - 2;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].t < cutoff) drop++;
    if (drop) this.samples.splice(0, drop);
    for (const [id, p] of this.parts) {
      if (p.pts.length && p.pts[p.pts.length - 2] < cutoff) this.parts.delete(id);
    }
  }

  private endRound() {
    const r = this.round!;
    this.round = null;
    this.lastPeak = r.spikes ? SUM.threshold : r.peak;
    this.updateReadouts();
    if (this.pinned) return;
    const text = summarise(r);
    this.setCaption(text);
    this.announce(text, true);
  }

  // ---------- Drawing ----------

  private palette() {
    return readPalette(this, {
      bg: '--bg',
      surface: '--surface',
      surface2: '--surface-2',
      border: '--border',
      text: '--text',
      muted: '--text-muted',
      faint: '--text-faint',
      excite: '--excite',
      inhibit: '--inhibit',
      accent: '--accent',
      membrane: '--membrane',
      membraneEdge: '--membrane-edge',
      trace: '--trace',
      grid: '--grid',
      bad: '--bad',
      warn: '--warn',
      mono: '--font-mono',
    });
  }

  protected render(): void {
    if (!this.board) return;
    const pal = this.palette();
    this.drawBoard(pal);
    this.drawTrace(pal);
    this.updateReadouts();
  }

  private setCaption(text: string) {
    const el = this.$('.caption');
    if (el.textContent !== text) el.textContent = text;
  }

  private updateReadouts() {
    this.$('.r-v').textContent = `${fmt(this.model.v, 1)} mV`;
    this.$('.r-peak').textContent =
      this.lastPeak === null ? '—' : this.lastPeak >= SUM.threshold ? 'threshold reached' : `${fmt(this.lastPeak, 1)} mV (${fmt(SUM.threshold - this.lastPeak, 1)} short)`;
    this.$('.r-spikes').textContent = String(this.totalSpikes);
  }

  private geom(W: number, H: number) {
    const cx = W * 0.5;
    const cy = H * 0.66;
    const somaR = Math.max(16, Math.min(W, H) * 0.075);
    // Fit the longest branch in the space above and beside the cell body.
    const up = cy - H * 0.05 - somaR;
    const side = W * 0.47 - somaR;
    const scale = Math.min(up / BRANCH_LENGTH, side / (BRANCH_LENGTH * Math.abs(Math.cos(BRANCH_ANGLE.a))));
    const at = (angle: number, d: number) => ({ x: cx + Math.cos(angle) * (somaR + d * scale), y: cy + Math.sin(angle) * (somaR + d * scale) });
    const site = SITES.map((s) => (s.branch === 'soma' ? { x: cx + Math.cos(SOMA_ANGLE) * somaR, y: cy + Math.sin(SOMA_ANGLE) * somaR } : at(BRANCH_ANGLE[s.branch], s.distance)));
    return { cx, cy, somaR, scale, at, site, hillY: cy + somaR * 0.95, axonTop: cy + somaR * 1.9 };
  }

  private drawBoard(pal: ReturnType<SummationElement['palette']>) {
    const { w: W, h: H } = fitCanvas(this.board);
    const size = `${W}x${H}`;
    if (size !== this.lastSize) {
      this.lastSize = size;
      this.placeSites(W, H);
    }
    const ctx = this.board.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const g = this.geom(W, H);
    const fs = this.hasAttribute('present') ? 1.25 : 1;
    const mono = (px: number) => `${Math.round(px * fs)}px ${pal.mono || 'monospace'}`;
    const lambda = this.model.params.lambda;

    // Distance rings, every 100 µm, on the upper side.
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    for (let d = 100; d <= 400; d += 100) {
      const R = g.somaR + d * g.scale;
      ctx.strokeStyle = withAlpha(pal.faint, 0.45);
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, R, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
      if (W < 480) continue;
      const a = (-66 * Math.PI) / 180;
      ctx.fillStyle = pal.faint;
      ctx.font = mono(10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${d} µm`, g.cx + Math.cos(a) * R + 4, g.cy + Math.sin(a) * R);
    }
    ctx.setLineDash([]);

    // Dendrites: tapering, drawn as a dark edge with a lighter core.
    const dendrite = (angle: number) => {
      const steps = 24;
      for (const [color, extra] of [
        [pal.membraneEdge, 2.5],
        [pal.membrane, 0],
      ] as const) {
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        for (let k = 0; k < steps; k++) {
          const d0 = (BRANCH_LENGTH * k) / steps;
          const d1 = (BRANCH_LENGTH * (k + 1)) / steps;
          const p0 = g.at(angle, d0 - (k === 0 ? 12 / g.scale : 0));
          const p1 = g.at(angle, d1);
          ctx.lineWidth = Math.max(2, g.somaR * 0.55 * (1 - (0.75 * d0) / BRANCH_LENGTH)) + extra;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }
    };
    for (const a of Object.values(BRANCH_ANGLE)) dendrite(a);

    // Axon and hillock.
    ctx.fillStyle = pal.membrane;
    ctx.strokeStyle = pal.membraneEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.cx - g.somaR * 0.55, g.cy + g.somaR * 0.7);
    ctx.lineTo(g.cx - g.somaR * 0.13, g.axonTop);
    ctx.lineTo(g.cx - g.somaR * 0.13, H + 4);
    ctx.lineTo(g.cx + g.somaR * 0.13, H + 4);
    ctx.lineTo(g.cx + g.somaR * 0.13, g.axonTop);
    ctx.lineTo(g.cx + g.somaR * 0.55, g.cy + g.somaR * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cell body, tinted by the hillock voltage.
    const dv = this.model.v - SUM.vRest;
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, g.somaR, 0, Math.PI * 2);
    ctx.fillStyle = pal.membrane;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pal.membraneEdge;
    ctx.stroke();
    const tint = Math.max(-1, Math.min(1, dv / 15));
    if (Math.abs(tint) > 0.02) {
      ctx.fillStyle = withAlpha(tint > 0 ? pal.excite : pal.inhibit, 0.75 * Math.abs(tint));
      ctx.beginPath();
      ctx.arc(g.cx, g.cy, g.somaR * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }

    // The hillock region and a recording electrode.
    const hy = (g.cy + g.somaR * 0.7 + g.axonTop) / 2;
    const ex = g.cx + g.somaR * 2.4;
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.cx + g.somaR * 0.4, hy);
    ctx.lineTo(ex, hy + g.somaR * 0.9);
    ctx.stroke();
    ctx.fillStyle = pal.text;
    ctx.font = mono(10.5);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('axon hillock', ex + 4, hy + g.somaR * 0.9);
    ctx.fillStyle = pal.faint;
    ctx.fillText(`${fmt(this.model.v, 1)} mV`, ex + 4, hy + g.somaR * 0.9 + 14 * fs);
    ctx.textAlign = 'right';
    ctx.fillText('axon', g.cx - g.somaR * 0.4, H - 10);

    // Spikes running down the axon.
    for (const age of this.axonSpikes) {
      const y = g.axonTop + (H - g.axonTop) * (age / 0.6);
      ctx.fillStyle = withAlpha(pal.warn, 1 - age / 0.6);
      ctx.beginPath();
      ctx.arc(g.cx, y, g.somaR * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }

    // Signals travelling from each synapse to the hillock.
    const t = this.model.t;
    for (const i of this.model.inputs) {
      if (t < i.t) continue;
      const tPeak = i.arrive + peakTime(i.rise, i.decay);
      if (t > tPeak + 1) continue;
      const p = Math.min(1, (t - i.t) / Math.max(0.5, tPeak - i.t));
      const from = g.site[i.site];
      const x = from.x + (g.cx - from.x) * p;
      const y = from.y + (g.cy - from.y) * p;
      const r = Math.max(3, g.somaR * 0.5 * (i.weight * (1 - p) + i.weight * p) * (0.6 + 0.4 * (1 - p)));
      const col = i.kind === 'exc' ? pal.excite : pal.inhibit;
      ctx.fillStyle = withAlpha(col, 0.85);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Site names next to each slot.
    ctx.font = mono(10);
    ctx.fillStyle = pal.muted;
    ctx.textBaseline = 'middle';
    SITES.forEach((s, i) => {
      const p = g.site[i];
      const btn = (W < 480 ? 14 : 17) * (this.hasAttribute('present') ? 1.2 : 1);
      if (s.branch === 'soma') {
        ctx.textAlign = 'right';
        ctx.fillText(s.id, p.x - btn - 2, p.y);
        return;
      }
      const a = BRANCH_ANGLE[s.branch];
      const nx = Math.cos(a + Math.PI / 2);
      const ny = Math.sin(a + Math.PI / 2);
      const side = 1;
      ctx.textAlign = nx * side > 0.2 ? 'left' : nx * side < -0.2 ? 'right' : 'center';
      ctx.fillText(s.id, p.x + nx * side * (btn + 4), p.y + ny * side * (btn + 4));
    });

    // Length constant marker on branch C: a bar from the soma out to λ.
    const lam = Math.min(lambda, BRANCH_LENGTH);
    const a = BRANCH_ANGLE.c;
    const p0 = g.at(a, 0);
    const p1 = g.at(a, lam);
    const off = -g.somaR * 0.95;
    ctx.strokeStyle = withAlpha(pal.accent, 0.8);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x + off, p0.y);
    ctx.lineTo(p1.x + off, p1.y);
    ctx.moveTo(p1.x + off - 4, p1.y);
    ctx.lineTo(p1.x + off + 4, p1.y);
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = mono(10);
    ctx.fillText(lambda > BRANCH_LENGTH ? 'λ ↑' : 'λ', p1.x + off - 6, p1.y);
  }

  private drawTrace(pal: ReturnType<SummationElement['palette']>) {
    const { w: W, h: H } = fitCanvas(this.trace);
    const ctx = this.trace.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const fs = this.hasAttribute('present') ? 1.2 : 1;
    const mono = (px: number) => `${Math.round(px * fs)}px ${pal.mono || 'monospace'}`;
    const narrow = W < 420;
    const left = 40 * fs;
    const right = 10;
    const top = 26 * fs;
    const bottom = 34 * fs;
    const lo = -84;
    const hi = -47;
    const tNow = this.model.t;
    const t0 = tNow - WINDOW;
    const xOf = (t: number) => left + ((t - t0) / WINDOW) * (W - left - right);
    const yOf = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (H - top - bottom);

    ctx.fillStyle = withAlpha(pal.surface2, 0.6);
    ctx.fillRect(left, top, W - left - right, H - top - bottom);
    ctx.fillStyle = pal.muted;
    ctx.font = mono(10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(narrow ? 'Hillock voltage (mV)' : 'Voltage at the axon hillock (mV)', left, 6);

    // Grid lines and labels.
    const hline = (v: number, label: string, color: string, dash: number[]) => {
      const y = yOf(v);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(W - right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color === pal.grid ? pal.faint : color;
      ctx.font = mono(9.5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, left - 5, y);
    };
    hline(-80, '−80', pal.grid, []);
    hline(SUM.vRest, '−70', pal.grid, []);
    hline(-60, '−60', pal.grid, []);
    hline(SUM.threshold, '−55', withAlpha(pal.bad, 0.8), [3, 4]);
    ctx.fillStyle = pal.bad;
    ctx.font = mono(9.5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('threshold', W - right - 4, yOf(SUM.threshold) - 2);
    ctx.fillStyle = pal.faint;
    ctx.textBaseline = 'top';
    ctx.fillText('rest', W - right - 4, yOf(SUM.vRest) + 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, W - left - right, H - top - bottom);
    ctx.clip();

    // Each input on its own (thin), measured from rest.
    if (this.showParts) {
      for (const p of this.parts.values()) {
        if (p.pts.length < 4) continue;
        ctx.strokeStyle = withAlpha(p.kind === 'exc' ? pal.excite : pal.inhibit, 0.75);
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(xOf(p.pts[0]), yOf(SUM.vRest));
        for (let k = 0; k < p.pts.length; k += 2) ctx.lineTo(xOf(p.pts[k]), yOf(SUM.vRest + p.pts[k + 1]));
        ctx.stroke();
      }
    }

    // The sum.
    ctx.strokeStyle = pal.trace;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let started = false;
    for (const s of this.samples) {
      if (s.t < t0 - 1) continue;
      const x = xOf(s.t);
      const y = yOf(Math.min(hi + 6, s.v));
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    // Spikes: the line leaves the top of the chart.
    for (const ts of this.model.spikes) {
      if (ts < t0) continue;
      const x = xOf(ts);
      ctx.fillStyle = pal.warn;
      ctx.beginPath();
      ctx.moveTo(x, top - 3);
      ctx.lineTo(x - 5, top + 5);
      ctx.lineTo(x + 5, top + 5);
      ctx.closePath();
      ctx.fill();
      ctx.font = mono(10);
      ctx.textAlign = x > W - 60 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('spike', x + (x > W - 60 ? -7 : 7), top + 4);
    }

    // Inputs: ticks along the bottom at the moment each synapse fired.
    const yTicks = H - bottom + 4;
    ctx.font = mono(9);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const i of this.allInputs()) {
      if (i.t < t0 || i.t > tNow) continue;
      const x = xOf(i.t);
      ctx.fillStyle = i.kind === 'exc' ? pal.excite : pal.inhibit;
      ctx.fillRect(x - 1, yTicks, 2.5, 7);
    }
    // Time axis.
    ctx.fillStyle = pal.faint;
    ctx.font = mono(9.5);
    ctx.textBaseline = 'top';
    const firstEnd = left + ctx.measureText(`−${WINDOW} ms`).width + 8;
    for (let k = 0; k <= WINDOW; k += 20) {
      const x = xOf(tNow - k);
      if (k !== WINDOW && k !== 0 && x - ctx.measureText(`−${k}`).width / 2 < firstEnd) continue;
      if (k === WINDOW) {
        ctx.textAlign = 'left';
        ctx.fillText(`−${k} ms`, left, H - bottom + 15);
      } else if (k === 0) {
        ctx.textAlign = 'right';
        ctx.fillText('now', W - right, H - bottom + 15);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(`−${k}`, x, H - bottom + 15);
      }
    }
  }

  /** Every input still drawn on the trace, including ones the model has forgotten. */
  private allInputs(): Part[] {
    return [...this.parts.values()];
  }
}

/** Time from the start of a double-exponential PSP to its peak. */
function peakTime(rise: number, decay: number): number {
  return ((rise * decay) / (decay - rise)) * Math.log(decay / rise);
}

/** "A1e,B1e,Si" → site → kind */
export function parseSites(text: string): Map<number, InputKind> {
  const out = new Map<number, InputKind>();
  for (const part of text.split(',')) {
    const m = /^([A-Za-z]\d?)([ei])$/.exec(part.trim());
    if (!m) continue;
    const i = SITES.findIndex((s) => s.id.toLowerCase() === m[1].toLowerCase());
    if (i >= 0) out.set(i, m[2] === 'e' ? 'exc' : 'inh');
  }
  return out;
}

/** One or two sentences on what just happened. */
export function summarise(r: { inputs: { site: number; kind: InputKind }[]; peak: number; trough: number; spikes: number }): string {
  const exc = r.inputs.filter((i) => i.kind === 'exc');
  const inh = r.inputs.filter((i) => i.kind === 'inh');
  const excSites = new Set(exc.map((i) => i.site));
  const repeated = exc.length > excSites.size;
  if (r.spikes > 0) {
    const how =
      excSites.size > 1 && repeated
        ? 'Spatial and temporal summation together'
        : excSites.size > 1
          ? 'EPSPs from different synapses added up (spatial summation) and'
          : repeated
            ? 'EPSPs from one synapse, close together in time, piled up (temporal summation) and'
            : 'The EPSPs';
    const fired = r.spikes > 1 ? `fired ${r.spikes} spikes` : 'fired a spike';
    const start = `${how} reached threshold. The cell ${fired}.`;
    return inh.length ? `${start} The inhibition was too weak or too far away to stop it.` : start;
  }
  const short = SUM.threshold - r.peak;
  if (!exc.length && inh.length) return `An IPSP: the hillock dipped to ${fmt(r.trough, 1)} mV, further away from threshold.`;
  if (inh.length) return `The hillock reached ${fmt(r.peak, 1)} mV, ${fmt(short, 1)} mV short of threshold. Inhibition cancelled part of the excitation. No spike.`;
  return `The hillock reached ${fmt(r.peak, 1)} mV, ${fmt(short, 1)} mV short of threshold. No spike.`;
}

if (!customElements.get('nc-summation')) customElements.define('nc-summation', SummationElement);
