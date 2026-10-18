import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { fitCanvas, readPalette, roundRect, withAlpha } from '../shared/canvas';
import { click, unlockAudio } from '../shared/audio';
import { setSetting, soundOn } from '../shared/settings';
import {
  IMG_H,
  IMG_W,
  MAX_SPREAD,
  MAX_STRENGTH,
  MIN_SPREAD,
  SETTLE_RATE,
  STRIP_N,
  Sheet,
  decodeProfile,
  defaultNet,
  encodeProfile,
  imagePattern,
  rampKnees,
  round,
  steady,
  stripPattern,
  surround,
  uniformGain,
  type Gaze,
  type ImagePattern,
  type NetParams,
  type Picture,
  type StripPattern,
} from './model';

/**
 * <nc-lateral-inhibition>: light falls on a row of cells (or a whole sheet of them) that
 * inhibit their neighbours. Watch the network settle, record from one cell, draw your own light,
 * and see Mach bands, the Hermann grid and simultaneous contrast fall out of one simple rule.
 *
 * Attributes: preset, mode ("strip" | "image"), pattern, strength, spread, feedforward, profile,
 * gaze, electrode, predict, present, lab-href.
 */

type Mode = 'strip' | 'image';

interface Preset {
  mode: Mode;
  strip?: StripPattern;
  image?: ImagePattern;
  strength?: number;
  spread?: number;
  feedforward?: boolean;
  gaze?: boolean;
  electrode?: number;
  caption?: string;
}

const N = STRIP_N;
/** Firing rate for full light with no inhibition */
const MAX_RATE = 100;
const ROUNDS_PER_SEC = 6;

function defaultElectrode(p: StripPattern): number {
  switch (p) {
    case 'edge':
      return N / 2;
    case 'staircase':
      return 24;
    case 'mach':
      return rampKnees(N).b;
    case 'bar':
      return Math.ceil((N - 1) / 2 - N / 14);
    default:
      return N / 2;
  }
}

export const LI_PRESETS: Record<string, Preset> = {
  edge: { mode: 'strip', strip: 'edge', strength: 0.6, spread: 2.5 },
  staircase: { mode: 'strip', strip: 'staircase', strength: 0.7, spread: 2.5 },
  mach: { mode: 'strip', strip: 'mach', strength: 0.9, spread: 5 },
  bar: { mode: 'strip', strip: 'bar', strength: 0.6, spread: 2.5 },
  uniform: { mode: 'strip', strip: 'uniform', strength: 0.6, spread: 2.5 },
  draw: { mode: 'strip', strip: 'draw', strength: 0.7, spread: 3, caption: 'Drag on the graph to draw your own pattern of light. The cells respond as you draw.' },
  'no-inhibition': {
    mode: 'strip',
    strip: 'edge',
    strength: 0,
    spread: 2.5,
    caption: 'Inhibition is set to zero, so every cell simply copies its light. Now raise the inhibition strength and watch the edge.',
  },
  feedforward: { mode: 'strip', strip: 'edge', strength: 0.6, spread: 2.5, feedforward: true },
  hermann: { mode: 'image', image: 'hermann', strength: 0.8, spread: 4 },
  contrast: { mode: 'image', image: 'contrast', strength: 0.8, spread: 4 },
  'mach-picture': { mode: 'image', image: 'mach', strength: 0.9, spread: 5 },
  'staircase-picture': { mode: 'image', image: 'staircase', strength: 0.8, spread: 3 },
  gaze: { mode: 'image', image: 'hermann', strength: 0.8, spread: 4, gaze: true },
};

const STRIP_LABELS: Record<StripPattern, string> = {
  edge: 'Edge',
  staircase: 'Staircase',
  mach: 'Ramp',
  bar: 'Bar',
  uniform: 'Even light',
  draw: 'Draw your own',
};

const IMAGE_LABELS: Record<ImagePattern, string> = {
  hermann: 'Hermann grid',
  contrast: 'Grey squares',
  mach: 'Ramp',
  staircase: 'Staircase',
};

const STRIP_CAPTIONS: Record<StripPattern, string> = {
  edge: 'Cells just on the bright side of the edge fire more than cells deep in the bright area, because their dim neighbours inhibit them less. Just across the edge, cells fire less. The edge is exaggerated.',
  staircase:
    'Every step is perfectly even, yet each one fires more where it borders a darker step and less where it borders a lighter one. That is why the bands look scalloped (the Chevreul illusion).',
  mach: 'The light rises smoothly, with no edges at all. Still, the output has an extra bright band where the ramp meets the light side and a dark band where it meets the dim side. These are Mach bands. You can probably see them in the light strip at the top, too.',
  bar: 'The bar gets bright rims just inside its edges, and the dim ground right beside it gets darker. Narrow bright things stand out more than their light alone would predict.',
  uniform: 'Even light gives even firing: every cell is held back by the same amount. Lateral inhibition reports where the light changes, not how much light there is.',
  draw: 'Your pattern: wherever the light changes, the output exaggerates the change, and flat stretches come out flat. Drag on the graph to draw more.',
};

const IMAGE_CAPTIONS: Record<ImagePattern, string> = {
  hermann:
    'All the light streets are equally light. But a cell at a crossing has light on four sides, while a cell along a street has light on only two, so the crossing cell gets more inhibition. The network reports grey spots at the crossings. Do you see them in the picture, too?',
  contrast:
    'The two small squares are exactly the same grey. The one on the dark side has dim neighbours, so it gets less inhibition and fires more: it looks lighter. Lateral inhibition explains part of this illusion, not all of it.',
  mach: 'A smooth ramp, and yet the output has a light stripe where the ramp meets the light side and a dark stripe where it meets the dim side: Mach bands.',
  staircase: 'Each stripe is even, but its edges are exaggerated: lighter next to a darker stripe, darker next to a lighter one.',
};

const GAZE_CAPTION =
  'Move the pointer over the grid: it marks where you look. In the fovea, receptive fields (the rings) are small, so the spot at the crossing you look at disappears, while spots stay in the periphery. Try it with your own eyes on the picture.';

const QUESTIONS: Record<string, PredictQuestion> = {
  edge: {
    id: 'li-edge',
    question: 'The light steps from dim to bright. Compared with cells deep in the bright area, what will the cell just on the bright side of the edge do?',
    options: ['Fire about the same.', 'Fire more.', 'Fire less.'],
    correct: 1,
    explain: 'Its neighbours on the dim side fire less, so they inhibit it less. Less inhibition means more firing: the edge gets exaggerated.',
  },
  uniform: {
    id: 'li-uniform',
    question: 'Every receptor gets the same light. What will the firing across the row look like?',
    options: ['Flat, at the same level as the light.', 'Flat, but lower than the light.', 'Highest in the middle of the row.'],
    correct: 1,
    explain: 'Every cell is inhibited by the same amount, so the output is flat but lower. Lateral inhibition reports changes, not levels.',
  },
  mach: {
    id: 'li-mach',
    question: 'The light rises in a smooth ramp, with no sharp edges. What will the firing show?',
    options: ['The same smooth ramp, only lower.', 'An extra bright band and an extra dark band at the two ends of the ramp.', 'A sharp step in the middle of the ramp.'],
    correct: 1,
    explain: 'Where the ramp meets the bright side, a cell has dimmer neighbours on one side, so it is inhibited less and fires more. The opposite happens at the dim end. These are Mach bands.',
  },
  hermann: {
    id: 'li-hermann',
    question: 'All the light streets get the same light. Where along the streets will the network fire least?',
    options: ['At the crossings.', 'Halfway between two crossings.', 'Nowhere: the streets stay even.'],
    correct: 0,
    explain: 'A cell at a crossing has light on four sides, a cell along a street on only two. More light around a cell means more inhibition, so the crossings fire less and look grey.',
  },
  contrast: {
    id: 'li-contrast',
    question: 'The two small squares are exactly the same grey. Which will fire more?',
    options: ['The square on the dark side.', 'The square on the light side.', 'Both the same.'],
    correct: 0,
    explain: 'The square on the dark side has dim neighbours, so it receives less inhibition and fires more. It looks lighter.',
  },
  gaze: {
    id: 'li-gaze',
    question: 'You look straight at one crossing. What happens to the grey spot there?',
    options: ['It gets darker.', 'It disappears.', 'It moves to the next crossing.'],
    correct: 1,
    explain: 'In the fovea, receptive fields are smaller than the width of a street, so a cell at the crossing gets no more inhibition than one along the street. No spot.',
  },
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function readPal(el: Element) {
  return readPalette(el, {
    surface: '--surface',
    surface2: '--surface-2',
    border: '--border',
    borderStrong: '--border-strong',
    text: '--text',
    muted: '--text-muted',
    accent: '--accent',
    excite: '--excite',
    inhibit: '--inhibit',
    grid: '--grid',
    focus: '--focus',
    mono: '--font-mono',
    body: '--font-body',
  });
}
type Pal = ReturnType<typeof readPal>;

export class LateralInhibitionElement extends SimElement {
  private mode: Mode = 'strip';
  private pattern: StripPattern = 'edge';
  private picture: ImagePattern = 'hermann';
  private presetName = 'edge';
  private net: NetParams = { ...defaultNet };
  private inhibitionOn = true;

  // Strip state
  private e: Float64Array = stripPattern('edge');
  private r: Float64Array = new Float64Array(N);
  private rounds = 0;
  private settled = true;
  private acc = 0;
  private electrode = N / 2;
  private clock = 0;
  private flashAt = -1;
  private drawing = false;
  private lastDrawI = -1;

  // Picture state
  private img: Picture = imagePattern('hermann');
  private sheet = new Sheet();
  private sheetKey = '';
  private rImg: Float32Array = new Float32Array(IMG_W * IMG_H);
  private imgRounds = 0;
  private imgSettled = true;
  private gazeOn = false;
  private probe: Gaze = { x: 64, y: 48 };
  private probeShown = false;
  private solvePending = false;
  private off?: HTMLCanvasElement;

  private pinnedCaption: string | null = null;
  private lastReadout = 0;

  private stripCanvas!: HTMLCanvasElement;
  private inCanvas!: HTMLCanvasElement;
  private outCanvas!: HTMLCanvasElement;

  static get observedAttributes() {
    return ['present'];
  }

  attributeChangedCallback() {
    this.render();
  }

  private get eff(): NetParams {
    return { ...this.net, strength: this.inhibitionOn ? this.net.strength : 0 };
  }

  // ---------- Building ----------

  protected build(): void {
    const stripButtons = (Object.keys(STRIP_LABELS) as StripPattern[])
      .map((p) => `<button type="button" data-strip="${p}" aria-pressed="false">${STRIP_LABELS[p]}</button>`)
      .join('');
    const imageButtons = (Object.keys(IMAGE_LABELS) as ImagePattern[])
      .map((p) => `<button type="button" data-image="${p}" aria-pressed="false">${IMAGE_LABELS[p]}</button>`)
      .join('');
    this.html(`
      <style>
        [hidden] { display: none !important; }
        .mode-tabs { margin-bottom: var(--sim-gap); }
        .mode-tabs button[aria-selected='true'] {
          background: var(--accent, #b69cff);
          border-color: var(--accent, #b69cff);
          color: var(--accent-ink, #160b3a);
        }
        canvas.strip { aspect-ratio: 16 / 10.5; cursor: crosshair; touch-action: none; }
        @container (max-width: 560px) { canvas.strip { aspect-ratio: 4 / 4.8; } }
        @container (min-width: 900px) { canvas.strip { aspect-ratio: 16 / 8.6; } }
        .pair { display: grid; gap: var(--sim-gap); grid-template-columns: 1fr; }
        @container (min-width: 600px) { .pair { grid-template-columns: 1fr 1fr; } }
        canvas.pic { aspect-ratio: 4 / 3; cursor: crosshair; touch-action: none; }
        .patterns { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.35rem; }
        .patterns button { min-height: 2.25rem; padding: 0.25rem 0.8rem; font-size: 0.92em; }
        .inhib[aria-pressed='false'] { border-color: var(--bad, #ff8a80); }
        .hint { font-size: 0.8em; color: var(--text-muted, #a9b3c7); margin: 0.35rem 0 0; }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Lateral inhibition lab<small>Cells that hold back their neighbours · Hartline–Ratliff network</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Play: switch the light on and watch the cells settle"><span aria-hidden="true">▶</span> <span class="lbl">Play</span></button>
            <button class="step" type="button" aria-label="Step one round of settling" title="One round">⏭</button>
            <button class="reset" type="button" aria-label="Reset to the moment the light comes on" title="Reset">↺</button>
            <span class="timescale"></span>
          </div>
        </div>
        <div class="tabs mode-tabs" role="tablist" aria-label="What the light falls on">
          <button type="button" role="tab" class="tab-strip" aria-selected="true" aria-controls="panel-strip">A row of cells</button>
          <button type="button" role="tab" class="tab-image" aria-selected="false" aria-controls="panel-image">A whole picture</button>
        </div>
        <p class="caption" aria-live="off"></p>
        <div id="panel-strip" role="tabpanel" aria-label="A row of cells">
          <figure>
            <canvas class="strip" tabindex="0" role="img" aria-label="A row of light receptors, the light on each, and each cell's firing"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="line" style="background: var(--text-muted)"></i>Light on each receptor (dashed, %)</span>
                <span><i class="line" style="background: var(--excite)"></i>Firing of each cell (spikes/s)</span>
                <span><i class="line" style="background: var(--inhibit)"></i>Inhibition from the recorded cell</span>
              </span>
              <span class="hint">Tap a cell to record from it. Drag on the graph to draw your own light.</span>
            </figcaption>
          </figure>
        </div>
        <div id="panel-image" role="tabpanel" aria-label="A whole picture" hidden>
          <div class="pair">
            <figure>
              <canvas class="pic in" tabindex="0" role="img" aria-label="The picture: the light falling on a sheet of receptors"></canvas>
              <figcaption>The picture: light on ${IMG_W} × ${IMG_H} receptors</figcaption>
            </figure>
            <figure>
              <canvas class="pic out" role="img" aria-label="What the network of cells reports"></canvas>
              <figcaption>What the cells report, rescaled so even areas keep their brightness</figcaption>
            </figure>
          </div>
        </div>
        <div class="readouts" role="group" aria-label="Readouts">
          <span class="ro-strip"><b>Recording from</b><span class="r-cell"></span></span>
          <span class="ro-strip"><b>Light</b><span class="r-light"></span></span>
          <span class="ro-strip"><b>Firing</b><span class="r-rate"></span></span>
          <span class="ro-strip"><b>Without inhibition</b><span class="r-alone"></span></span>
          <span class="ro-image" hidden><b>Light here</b><span class="r-ilight"></span></span>
          <span class="ro-image" hidden><b>Firing here</b><span class="r-irate"></span></span>
          <span class="ro-image" hidden><b>Surround here</b><span class="r-iwidth"></span></span>
        </div>
        <div class="controls">
          <fieldset>
            <legend>Light pattern</legend>
            <div class="patterns pat-strip" role="group" aria-label="Light patterns for the row">${stripButtons}</div>
            <div class="patterns pat-image" role="group" aria-label="Pictures" hidden>${imageButtons}</div>
            <label class="toggle gaze-wrap" hidden><input type="checkbox" class="gaze" /><span>Follow my gaze<small>Small receptive fields where you look, bigger ones further out</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Inhibition</legend>
            <div class="row">
              <button class="inhib" type="button" aria-pressed="true">Inhibition on</button>
            </div>
            <div class="slider">
              <label for="strength">Strength: how hard neighbours hold each other back</label>
              <input id="strength" class="strength" type="range" min="0" max="${MAX_STRENGTH}" step="0.05" />
              <output for="strength" class="o-strength"></output>
            </div>
            <div class="slider">
              <label for="spread">Reach: how far the inhibition spreads</label>
              <input id="spread" class="spread" type="range" min="${MIN_SPREAD}" max="${MAX_SPREAD}" step="0.1" />
              <output for="spread" class="o-spread"></output>
            </div>
            <label class="toggle"><input type="checkbox" class="ff" /><span>Feed-forward only<small>Inhibition driven by the light itself, with no loops between cells</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Options</legend>
            <label class="toggle"><input type="checkbox" class="sound" /><span>Sound<small>Hear the recorded cell fire, like a lab audio monitor</small></span></label>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Ask what will happen before the light comes on</small></span></label>
            <div class="row">
              <button class="png" type="button">Save PNG</button>
              <button class="link" type="button">Copy link</button>
            </div>
            <p class="keys">Keys: <kbd>Space</kbd> play or pause · <kbd>←</kbd> <kbd>→</kbd> move the electrode · <kbd>I</kbd> inhibition on or off · <kbd>S</kbd> step · <kbd>R</kbd> reset</p>
          </fieldset>
        </div>
      </div>`);

    this.stripCanvas = this.$('canvas.strip') as HTMLCanvasElement;
    this.inCanvas = this.$('canvas.pic.in') as HTMLCanvasElement;
    this.outCanvas = this.$('canvas.pic.out') as HTMLCanvasElement;

    // Start from a preset, then apply any explicit attributes (as set by a shared link).
    this.applyPreset(this.getAttribute('preset') ?? 'edge', false);
    const num = (name: string) => {
      const v = this.getAttribute(name);
      return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    const mode = this.getAttribute('mode');
    if (mode === 'strip' || mode === 'image') this.mode = mode;
    const pattern = this.getAttribute('pattern');
    if (pattern && pattern in STRIP_LABELS && this.mode === 'strip') this.setStripPattern(pattern as StripPattern, false);
    if (pattern && pattern in IMAGE_LABELS && this.mode === 'image') this.setPicture(pattern as ImagePattern, false);
    const strength = num('strength');
    if (strength !== null) this.net.strength = Math.min(MAX_STRENGTH, Math.max(0, strength));
    const spread = num('spread');
    if (spread !== null) this.net.spread = Math.min(MAX_SPREAD, Math.max(MIN_SPREAD, spread));
    const ff = this.getAttribute('feedforward');
    if (ff !== null) this.net.feedforward = ff !== 'false' && ff !== '0';
    const gaze = this.getAttribute('gaze');
    if (gaze !== null) this.gazeOn = gaze !== 'false' && gaze !== '0';
    const profile = this.getAttribute('profile');
    if (profile) {
      const e = decodeProfile(profile, N);
      if (e) {
        this.pattern = 'draw';
        this.e = e;
      }
    }
    const el = num('electrode');
    if (el !== null) this.electrode = Math.min(N - 1, Math.max(0, Math.round(el)));
    this.solveNow();
    this.syncControls();
    this.wire();
  }

  // ---------- Presets and patterns ----------

  /** Apply a named preset, e.g. from a "Try this" button in a lesson. */
  applyPreset(name: string, start = true): void {
    const key = name in LI_PRESETS ? name : 'edge';
    const p = LI_PRESETS[key];
    this.presetName = key;
    this.mode = p.mode;
    this.net = { strength: p.strength ?? 0.6, spread: p.spread ?? 2.5, feedforward: !!p.feedforward };
    this.inhibitionOn = true;
    this.gazeOn = !!p.gaze;
    if (p.strip) this.setStripPattern(p.strip, false);
    if (p.image) this.setPicture(p.image, false);
    if (p.electrode !== undefined) this.electrode = p.electrode;
    this.pinnedCaption = p.caption ?? null;
    if (this.isConnected && this.stripCanvas && this.root.querySelector('.strength')) {
      this.pause();
      this.solveNow();
      this.syncControls();
      if (start) void this.startPlay();
      else this.render();
    }
  }

  private setStripPattern(p: StripPattern, keepDrawn = true): void {
    if (!(p === 'draw' && keepDrawn && this.pattern === 'draw')) this.e = stripPattern(p, N);
    this.pattern = p;
    this.electrode = defaultElectrode(p);
  }

  private setPicture(p: ImagePattern, solve = true): void {
    this.picture = p;
    this.img = imagePattern(p);
    if (p !== 'hermann') this.gazeOn = false;
    if (solve) this.solveNow();
  }

  /** Jump straight to the settled state (no animation). */
  private solveNow(): void {
    if (this.mode === 'strip') {
      this.r = steady(this.e, this.eff);
      this.settled = true;
    } else {
      this.configureSheet();
      this.rImg = this.sheet.steady(this.img.data, this.eff);
      this.imgSettled = true;
    }
  }

  /** Something changed: re-settle, animated if the light is on, instantly if not. */
  private changed(): void {
    if (this.mode === 'strip') {
      if (this.playing && !this.reducedMotion) this.settled = false;
      else {
        this.r = steady(this.e, this.eff, { start: this.r });
        this.settled = true;
      }
    } else {
      this.configureSheet();
      this.rImg = this.sheet.steady(this.img.data, this.eff, { start: this.imgSettled ? this.rImg : undefined });
      this.imgSettled = true;
    }
    this.render();
  }

  private configureSheet(): void {
    const gaze = this.gazeOn ? this.probe : null;
    const key = `${this.net.spread.toFixed(2)}|${gaze ? `${gaze.x.toFixed(1)},${gaze.y.toFixed(1)}` : '-'}`;
    if (key !== this.sheetKey) {
      this.sheet.configure(this.net.spread, gaze);
      this.sheetKey = key;
    }
  }

  // ---------- Controls ----------

  private syncControls(): void {
    const q = <T extends HTMLElement>(s: string) => this.$(s) as T;
    q<HTMLInputElement>('.strength').value = String(this.net.strength);
    q<HTMLInputElement>('.spread').value = String(this.net.spread);
    q<HTMLInputElement>('.ff').checked = !!this.net.feedforward;
    q<HTMLInputElement>('.gaze').checked = this.gazeOn;
    q<HTMLInputElement>('.sound').checked = soundOn();
    q<HTMLInputElement>('.predict').checked = this.predictEnabled;
    const inhib = q<HTMLButtonElement>('.inhib');
    inhib.setAttribute('aria-pressed', String(this.inhibitionOn));
    inhib.textContent = this.inhibitionOn ? 'Inhibition on' : 'Inhibition off';
    this.root.querySelectorAll<HTMLButtonElement>('[data-strip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.strip === this.pattern)));
    this.root.querySelectorAll<HTMLButtonElement>('[data-image]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.image === this.picture)));
    const strip = this.mode === 'strip';
    q('.tab-strip').setAttribute('aria-selected', String(strip));
    q('.tab-image').setAttribute('aria-selected', String(!strip));
    q('.tab-strip').tabIndex = strip ? 0 : -1;
    q('.tab-image').tabIndex = strip ? -1 : 0;
    q('#panel-strip').hidden = !strip;
    q('#panel-image').hidden = strip;
    q('.pat-strip').hidden = !strip;
    q('.pat-image').hidden = strip;
    q('.gaze-wrap').hidden = strip || this.picture !== 'hermann';
    this.root.querySelectorAll<HTMLElement>('.ro-strip').forEach((el) => (el.hidden = !strip));
    this.root.querySelectorAll<HTMLElement>('.ro-image').forEach((el) => (el.hidden = strip));
    this.$('.keys').innerHTML = strip
      ? 'Keys: <kbd>Space</kbd> play or pause · <kbd>←</kbd> <kbd>→</kbd> move the electrode · <kbd>I</kbd> inhibition on or off · <kbd>S</kbd> step · <kbd>R</kbd> reset'
      : 'Keys: <kbd>Space</kbd> play or pause · arrow keys move the pointer · <kbd>I</kbd> inhibition on or off · <kbd>S</kbd> step · <kbd>R</kbd> reset';
    this.updateOutputs();
  }

  private updateOutputs(): void {
    this.$('.o-strength').textContent = fmt(this.net.strength, 2);
    this.$('.o-spread').textContent = `${fmt(this.net.spread, 1)} cells`;
    const strip = this.mode === 'strip';
    const n = strip ? this.rounds : this.imgRounds;
    const done = strip ? this.settled : this.imgSettled;
    this.$('.timescale').textContent = done ? 'Settled' : n === 0 ? 'Light just on' : `Round ${n}`;
  }

  private wire(): void {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => void this.startPlay());
    on('.step', 'click', () => this.stepOnce());
    on('.reset', 'click', () => {
      this.reset();
      this.render();
    });
    on('.tab-strip', 'click', () => this.setMode('strip'));
    on('.tab-image', 'click', () => this.setMode('image'));
    this.$('.mode-tabs').addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        this.setMode(this.mode === 'strip' ? 'image' : 'strip');
        (this.$(this.mode === 'strip' ? '.tab-strip' : '.tab-image') as HTMLButtonElement).focus();
      }
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-strip]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = b.dataset.strip as StripPattern;
        this.presetName = p;
        this.pinnedCaption = p === 'draw' ? LI_PRESETS.draw.caption! : null;
        this.usePresetValues(p);
        this.setStripPattern(p);
        this.syncControls();
        this.changed();
        this.announce(`${STRIP_LABELS[p]}. ${this.captionText()}`, true);
      }),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-image]').forEach((b) =>
      b.addEventListener('click', () => {
        const p = b.dataset.image as ImagePattern;
        this.presetName = p === 'mach' ? 'mach-picture' : p === 'staircase' ? 'staircase-picture' : p;
        this.pinnedCaption = null;
        this.setPicture(p, false);
        this.usePresetValues(this.presetName);
        this.syncControls();
        this.changed();
        this.announce(`${IMAGE_LABELS[p]}. ${this.captionText()}`, true);
      }),
    );
    on('.gaze', 'change', (e) => {
      this.gazeOn = (e.target as HTMLInputElement).checked;
      if (this.gazeOn) this.presetName = 'gaze';
      this.pinnedCaption = null;
      this.changed();
    });
    on('.inhib', 'click', () => this.toggleInhibition());
    on('.strength', 'input', (e) => {
      this.net.strength = Number((e.target as HTMLInputElement).value);
      this.pinnedCaption = null;
      if (!this.inhibitionOn) this.inhibitionOn = true;
      this.syncControls();
      this.changed();
    });
    on('.spread', 'input', (e) => {
      this.net.spread = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
      this.changed();
    });
    on('.ff', 'change', (e) => {
      this.net.feedforward = (e.target as HTMLInputElement).checked;
      this.changed();
      this.announce(this.net.feedforward ? 'Feed-forward inhibition: no loops between cells.' : 'Recurrent inhibition: cells inhibit each other.', true);
    });
    on('.sound', 'change', (e) => {
      const v = (e.target as HTMLInputElement).checked;
      if (v) unlockAudio();
      setSetting('sound', v);
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.png', 'click', () => {
      if (this.mode === 'strip') this.savePng([this.stripCanvas], 'Lateral inhibition: a row of cells', 'lateral-inhibition.png');
      else this.savePng([this.inCanvas, this.outCanvas], `Lateral inhibition: ${IMAGE_LABELS[this.picture]}`, 'lateral-inhibition-picture.png');
    });
    on('.link', 'click', () => void this.copyLink());

    // The row: tap a cell to record from it; drag on the graph to draw light.
    const sc = this.stripCanvas;
    sc.addEventListener('pointerdown', (e) => {
      const hit = this.stripHit(e);
      if (!hit) return;
      if (hit.zone === 'plot') {
        this.drawing = true;
        this.lastDrawI = -1;
        sc.setPointerCapture(e.pointerId);
        this.drawAt(hit.i, hit.value);
      } else {
        this.moveElectrode(hit.i);
      }
    });
    sc.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      const hit = this.stripHit(e, true);
      if (hit) this.drawAt(hit.i, hit.value);
    });
    const endDraw = () => {
      if (!this.drawing) return;
      this.drawing = false;
      this.announce(this.captionText(), true);
    };
    sc.addEventListener('pointerup', endDraw);
    sc.addEventListener('pointercancel', endDraw);

    // The picture: the pointer is a probe, or your gaze.
    for (const c of [this.inCanvas, this.outCanvas]) {
      const move = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' && e.type === 'pointermove' && !e.buttons) return;
        const rect = c.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * IMG_W;
        const y = ((e.clientY - rect.top) / rect.height) * IMG_H;
        this.setProbe(x, y);
      };
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerdown', (e) => {
        c.setPointerCapture(e.pointerId);
        move(e);
      });
    }

    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT';
      if (e.key === ' ' && tag !== 'BUTTON' && !typing) {
        e.preventDefault();
        void this.startPlay();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') && !typing && target?.getAttribute('role') !== 'tab') {
        e.preventDefault();
        const big = e.shiftKey ? 5 : 1;
        if (this.mode === 'strip') {
          if (e.key === 'ArrowLeft') this.moveElectrode(this.electrode - big);
          if (e.key === 'ArrowRight') this.moveElectrode(this.electrode + big);
        } else {
          const d = 2 * big;
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
          this.setProbe(this.probe.x + dx, this.probe.y + dy);
        }
      } else if ((e.key === 'i' || e.key === 'I') && !typing) {
        this.toggleInhibition();
      } else if ((e.key === 's' || e.key === 'S') && !typing) {
        this.stepOnce();
      } else if ((e.key === 'r' || e.key === 'R') && !typing) {
        this.reset();
        this.render();
      }
    });
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
  }

  /**
   * Each pattern comes with the strength and reach that show its effect best. Drawing keeps
   * whatever the student has set, and the feed-forward choice always stays.
   */
  private usePresetValues(name: string): void {
    const p = LI_PRESETS[name];
    if (!p || name === 'draw') return;
    this.net.strength = p.strength ?? this.net.strength;
    this.net.spread = p.spread ?? this.net.spread;
    this.inhibitionOn = true;
  }

  private setMode(m: Mode): void {
    if (m === this.mode) return;
    this.pause();
    this.mode = m;
    this.pinnedCaption = null;
    this.presetName =
      m === 'strip' ? this.pattern : this.gazeOn ? 'gaze' : this.picture === 'mach' ? 'mach-picture' : this.picture === 'staircase' ? 'staircase-picture' : this.picture;
    this.usePresetValues(this.presetName);
    this.solveNow();
    this.syncControls();
    this.render();
  }

  private toggleInhibition(): void {
    this.inhibitionOn = !this.inhibitionOn;
    this.pinnedCaption = null;
    this.syncControls();
    this.changed();
    this.announce(this.inhibitionOn ? 'Inhibition on.' : 'Inhibition off: every cell copies its light.', true);
  }

  private moveElectrode(i: number): void {
    this.electrode = Math.min(N - 1, Math.max(0, Math.round(i)));
    this.render();
    const rate = this.r[this.electrode] * MAX_RATE;
    this.announce(`Recording from cell ${this.electrode + 1}: light ${Math.round(this.e[this.electrode] * 100)} percent, firing ${Math.round(rate)} spikes per second.`, false, 350);
  }

  private setProbe(x: number, y: number): void {
    this.probe = { x: Math.min(IMG_W - 0.5, Math.max(0.5, x)), y: Math.min(IMG_H - 0.5, Math.max(0.5, y)) };
    this.probeShown = true;
    if (this.gazeOn) this.scheduleSolve();
    else this.render();
  }

  /** Re-solve the picture for a new gaze point at most once per frame. */
  private scheduleSolve(): void {
    if (this.solvePending) return;
    this.solvePending = true;
    requestAnimationFrame(() => {
      this.solvePending = false;
      this.configureSheet();
      this.rImg = this.sheet.steady(this.img.data, this.eff, { start: this.rImg, maxRounds: 25 });
      this.imgSettled = true;
      this.render();
    });
  }

  private drawAt(i: number, value: number): void {
    if (this.pattern !== 'draw') {
      this.pattern = 'draw';
      this.presetName = 'draw';
      this.syncControls();
    }
    this.pinnedCaption = null;
    const from = this.lastDrawI < 0 ? i : this.lastDrawI;
    const fromV = this.lastDrawI < 0 ? value : this.e[this.lastDrawI];
    const lo = Math.min(from, i);
    const hi = Math.max(from, i);
    for (let k = lo; k <= hi; k++) {
      const t = hi === lo ? 1 : (k - from) / (i - from);
      this.e[k] = clamp01(fromV + (value - fromV) * t);
    }
    this.e[i] = clamp01(value);
    this.lastDrawI = i;
    this.changed();
  }

  /** Where on the row canvas is the pointer? */
  private stripHit(e: PointerEvent, force = false): { zone: 'plot' | 'cells'; i: number; value: number } | null {
    const rect = this.stripCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const L = this.layout(rect.width, rect.height);
    const i = Math.min(N - 1, Math.max(0, Math.floor((x - L.left) / L.cw)));
    const inPlot = y >= L.plotTop - 8 && y <= L.plotBottom + 8;
    if (!force && x < L.left - 4) return null;
    const value = clamp01((L.plotBottom - y) / (L.plotBottom - L.plotTop));
    return { zone: inPlot || force ? 'plot' : 'cells', i, value };
  }

  private async copyLink(): Promise<void> {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    u.searchParams.set('mode', this.mode);
    u.searchParams.set('pattern', this.mode === 'strip' ? this.pattern : this.picture);
    u.searchParams.set('strength', String(this.net.strength));
    u.searchParams.set('spread', String(this.net.spread));
    if (this.net.feedforward) u.searchParams.set('feedforward', '1');
    if (this.mode === 'image' && this.gazeOn) u.searchParams.set('gaze', '1');
    if (this.mode === 'strip' && this.pattern === 'draw') u.searchParams.set('profile', encodeProfile(this.e));
    const btn = this.$('.link');
    try {
      await navigator.clipboard.writeText(u.toString());
      btn.textContent = 'Link copied';
    } catch {
      prompt('Copy this link:', u.toString());
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
  }

  protected onSettings(): void {
    const box = this.root.querySelector('.sound') as HTMLInputElement | null;
    if (box) box.checked = soundOn();
  }

  protected onPlayState(): void {
    const b = this.root.querySelector('.play');
    if (!b) return;
    b.setAttribute('aria-label', this.playing ? 'Pause' : 'Play: switch the light on and watch the cells settle');
    b.querySelector('span[aria-hidden]')!.textContent = this.playing ? '❚❚' : '▶';
    b.querySelector('.lbl')!.textContent = this.playing ? 'Pause' : 'Play';
  }

  // ---------- Running ----------

  private questionFor(): PredictQuestion | null {
    if (this.mode === 'image') {
      if (this.gazeOn) return QUESTIONS.gaze;
      if (this.picture === 'hermann') return QUESTIONS.hermann;
      if (this.picture === 'contrast') return QUESTIONS.contrast;
      return null;
    }
    if (this.eff.strength === 0) return null;
    if (this.pattern === 'edge' || this.pattern === 'bar') return QUESTIONS.edge;
    if (this.pattern === 'uniform') return QUESTIONS.uniform;
    if (this.pattern === 'mach') return QUESTIONS.mach;
    return null;
  }

  /** Play, or pause if running. Asks the "predict" question first when that option is on. */
  private async startPlay(): Promise<void> {
    unlockAudio();
    if (this.playing) {
      this.pause();
      return;
    }
    const q = this.predictEnabled ? this.questionFor() : null;
    if (q) {
      // Hide the answer while the question is open.
      this.restart();
      this.render();
      await this.ask(q);
    }
    this.play();
  }

  play(): void {
    const done = this.mode === 'strip' ? this.settled : this.imgSettled;
    if (done) this.restart();
    super.play();
  }

  /** Back to the moment the light comes on: nobody has fired, so nobody inhibits anybody. */
  private restart(): void {
    this.acc = 0;
    if (this.mode === 'strip') {
      this.r = new Float64Array(N);
      this.rounds = 0;
      this.settled = false;
    } else {
      this.configureSheet();
      this.rImg = new Float32Array(IMG_W * IMG_H);
      this.imgRounds = 0;
      this.imgSettled = false;
    }
  }

  reset(): void {
    this.pause();
    this.restart();
    this.updateOutputs();
  }

  stepOnce(): void {
    this.pause();
    const done = this.mode === 'strip' ? this.settled : this.imgSettled;
    if (done) this.restart();
    this.advanceRound();
    this.render();
  }

  /** One round of settling. Returns true when the network has settled. */
  private advanceRound(): boolean {
    if (this.mode === 'strip') {
      if (this.settled) return true;
      const next = round(this.e, this.r, this.eff, SETTLE_RATE, surround(this.net.spread));
      let change = 0;
      for (let i = 0; i < N; i++) change = Math.max(change, Math.abs(next[i] - this.r[i]));
      this.r = next;
      this.rounds++;
      if (change < 0.0015 && this.rounds > 2) {
        this.settled = true;
        this.announce(`Settled after ${this.rounds} rounds. ${this.captionText()}`, true);
      }
      return this.settled;
    }
    if (this.imgSettled) return true;
    this.configureSheet();
    const next = new Float32Array(IMG_W * IMG_H);
    const change = this.sheet.round(this.img.data, this.rImg, this.eff, SETTLE_RATE, next);
    this.rImg = next;
    this.imgRounds++;
    if (change < 0.002 && this.imgRounds > 2) {
      this.imgSettled = true;
      this.announce(`Settled after ${this.imgRounds} rounds. ${this.captionText()}`, true);
    }
    return this.imgSettled;
  }

  protected tick(dt: number): void {
    this.clock += dt;
    if (this.reducedMotion) {
      // No animated settling: jump to the answer.
      this.solveNow();
    } else {
      this.acc += dt * ROUNDS_PER_SEC;
      while (this.acc >= 1) {
        this.acc -= 1;
        if (this.advanceRound()) {
          this.acc = 0;
          break;
        }
      }
    }
    if (this.mode === 'image') {
      if (this.imgSettled) this.pause();
      return;
    }
    // Listen to the recorded cell: random (Poisson) spikes at its firing rate.
    const rate = this.r[this.electrode] * MAX_RATE;
    const expected = rate * dt;
    let n = Math.floor(expected);
    if (Math.random() < expected - n) n++;
    if (n > 0) {
      this.flashAt = this.clock;
      if (soundOn()) click(1.15, 0.22);
    }
  }

  // ---------- Text ----------

  private captionText(): string {
    if (this.pinnedCaption) return this.pinnedCaption;
    const strip = this.mode === 'strip';
    const settled = strip ? this.settled : this.imgSettled;
    const n = strip ? this.rounds : this.imgRounds;
    if (!settled) {
      if (n === 0) return 'The light has just come on. No cell has fired yet, so no cell is inhibiting its neighbours.';
      if (n <= 2) return `Round ${n}: the cells start to fire, each as hard as its own light allows. Their inhibition is only now reaching the neighbours.`;
      return `Round ${n}: every cell is held back by its busy neighbours, and they by it, until the whole network settles. Watch where the light changes.`;
    }
    if (this.eff.strength === 0) return 'No inhibition: every cell simply copies its light. The output is the input, and edges look no sharper than they are.';
    const ff = this.net.feedforward ? ' (Feed-forward version: the inhibition comes from the light itself, not from the neighbours’ firing.)' : '';
    if (strip) return STRIP_CAPTIONS[this.pattern] + ff;
    if (this.gazeOn) return GAZE_CAPTION;
    return IMAGE_CAPTIONS[this.picture] + ff;
  }

  private setCaption(text: string): void {
    const el = this.$('.caption');
    if (el.textContent !== text) el.textContent = text;
  }

  private updateReadouts(): void {
    if (this.mode === 'strip') {
      const i = this.electrode;
      this.$('.r-cell').textContent = `cell ${i + 1} of ${N}`;
      this.$('.r-light').textContent = `${Math.round(this.e[i] * 100)}%`;
      this.$('.r-rate').textContent = `${fmt(this.r[i] * MAX_RATE, 1)} spikes/s`;
      this.$('.r-alone').textContent = `${fmt(this.e[i] * MAX_RATE, 1)} spikes/s`;
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of this.r) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      this.stripCanvas.setAttribute(
        'aria-label',
        `A row of ${N} light receptors. Light pattern: ${STRIP_LABELS[this.pattern]}. Firing ranges from ${Math.round(lo * MAX_RATE)} to ${Math.round(hi * MAX_RATE)} spikes per second. Recording from cell ${i + 1}, firing ${Math.round(this.r[i] * MAX_RATE)} spikes per second.`,
      );
    } else {
      const x = Math.floor(this.probe.x);
      const y = Math.floor(this.probe.y);
      const k = y * IMG_W + x;
      const gain = uniformGain(this.eff);
      this.$('.r-ilight').textContent = `${Math.round(this.img.data[k] * 100)}%`;
      this.$('.r-irate').textContent = `${fmt(this.rImg[k] * MAX_RATE, 1)} spikes/s (looks ${Math.round(clamp01(this.rImg[k] / gain) * 100)}%)`;
      this.$('.r-iwidth').textContent = `${fmt(this.sheet.widths[k] || this.net.spread, 1)} cells`;
      this.outCanvas.setAttribute(
        'aria-label',
        `What the cells report for the ${IMAGE_LABELS[this.picture]}. ${this.captionText()}`,
      );
    }
  }

  // ---------- Drawing ----------

  protected render(): void {
    if (!this.stripCanvas) return;
    const pal = readPal(this);
    if (this.mode === 'strip') this.drawStrip(pal);
    else this.drawPictures(pal);
    this.setCaption(this.captionText());
    const now = performance.now();
    if (now - this.lastReadout > 90 || !this.playing) {
      this.lastReadout = now;
      this.updateReadouts();
      this.updateOutputs();
    }
  }

  /** Shared geometry for drawing and hit-testing the row canvas. */
  private layout(w: number, h: number) {
    const narrow = w < 520;
    const left = (narrow ? 44 : 60) * (this.hasAttribute('present') ? 1.3 : 1);
    const right = narrow ? 10 : 16;
    const cw = (w - left - right) / N;
    const lightTop = 8;
    const lightH = Math.max(14, h * 0.05);
    const raysH = h * 0.045;
    const unitTop = lightTop + lightH + raysH;
    const unitH = Math.max(18, Math.min(h * 0.11, cw * (narrow ? 6 : 4)));
    const arcsTop = unitTop + unitH;
    const arcsH = h * 0.085;
    const seenH = Math.max(14, h * 0.055);
    const seenTop = h - seenH - 8;
    const plotTop = arcsTop + arcsH + h * 0.04;
    const plotBottom = seenTop - h * 0.075;
    return { narrow, left, right, cw, lightTop, lightH, raysH, unitTop, unitH, arcsTop, arcsH, plotTop, plotBottom, seenTop, seenH };
  }

  private drawStrip(pal: Pal): void {
    const c = this.stripCanvas;
    const { w, h } = fitCanvas(c);
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    const L = this.layout(w, h);
    const present = this.hasAttribute('present');
    const fs = Math.max(10, Math.min(14, w / 58)) * (present ? 1.25 : 1);
    const X = (i: number) => L.left + (i + 0.5) * L.cw;
    const grey = (v: number) => {
      const g = Math.round(clamp01(v) * 255);
      return `rgb(${g}, ${g}, ${g})`;
    };
    const eff = this.eff;
    const gain = uniformGain(eff);
    const maxR = Math.max(0.05, ...this.e);
    const sel = this.electrode;

    // Row labels in the left gutter
    ctx.font = `600 ${fs * 0.88}px ${pal.body}`;
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const gx = L.left - 8;
    ctx.fillText('Light', gx, L.lightTop + L.lightH / 2);
    ctx.fillText('Cells', gx, L.unitTop + L.unitH / 2);
    const seenLabel = !L.narrow && ctx.measureText('You see').width <= gx - 4 ? 'You see' : 'Seen';
    ctx.fillText(seenLabel, gx, L.seenTop + L.seenH / 2);

    // 1. The light pattern itself
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = grey(this.e[i]);
      ctx.fillRect(L.left + i * L.cw, L.lightTop, L.cw + 0.6, L.lightH);
    }
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(L.left + 0.5, L.lightTop + 0.5, L.cw * N - 1, L.lightH - 1);

    // 2. Rays of light falling on each receptor
    const rayTop = L.lightTop + L.lightH + 2;
    const rayBottom = L.unitTop - 1;
    for (let i = 0; i < N; i++) {
      const g = ctx.createLinearGradient(0, rayTop, 0, rayBottom);
      g.addColorStop(0, withAlpha(pal.text, 0.05 + 0.4 * this.e[i]));
      g.addColorStop(1, withAlpha(pal.text, 0));
      ctx.fillStyle = g;
      const x = X(i);
      const half = Math.max(0.6, L.cw * 0.22);
      ctx.beginPath();
      ctx.moveTo(x - half * 1.6, rayTop);
      ctx.lineTo(x + half * 1.6, rayTop);
      ctx.lineTo(x + half, rayBottom);
      ctx.lineTo(x - half, rayBottom);
      ctx.closePath();
      ctx.fill();
    }

    // 3. The cells: a receptor cap (lit by the light) on a body that glows with firing
    const uw = Math.max(2, L.cw * 0.68);
    const capH = L.unitH * 0.42;
    const flash = this.playing && this.clock - this.flashAt < 0.035 && !this.reducedMotion;
    for (let i = 0; i < N; i++) {
      const x = X(i) - uw / 2;
      const rr = Math.min(uw / 2, 5);
      // body
      const firing = clamp01(this.r[i] / maxR);
      roundRect(ctx, x, L.unitTop, uw, L.unitH, rr);
      ctx.fillStyle = pal.surface2;
      ctx.fill();
      roundRect(ctx, x, L.unitTop + capH, uw, L.unitH - capH, rr);
      ctx.fillStyle = withAlpha(pal.excite, 0.12 + 0.88 * firing);
      ctx.fill();
      // receptor cap
      roundRect(ctx, x, L.unitTop, uw, capH, rr);
      ctx.fillStyle = grey(0.1 + 0.85 * this.e[i]);
      ctx.fill();
      if (uw >= 5) {
        roundRect(ctx, x, L.unitTop, uw, L.unitH, rr);
        ctx.strokeStyle = withAlpha(pal.borderStrong, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // 4. Inhibition from the recorded cell to its neighbours (⊣ ends)
    const taps = surround(this.net.spread);
    const wMax = Math.max(...taps.weights);
    const sx = X(sel);
    const arcY = L.arcsTop + 2;
    if (eff.strength > 0) {
      taps.offsets.forEach((d, k) => {
        const j = sel + d;
        if (j < 0 || j >= N) return;
        const rel = taps.weights[k] / wMax;
        if (rel < 0.04) return;
        const tx = X(j);
        const depth = Math.min(L.arcsH - 6, 6 + Math.abs(d) * Math.min(6, L.arcsH / 6));
        ctx.strokeStyle = withAlpha(pal.inhibit, 0.25 + 0.75 * rel);
        ctx.lineWidth = Math.max(0.8, 3.2 * rel * Math.min(1, eff.strength / 0.6 + 0.2));
        ctx.beginPath();
        ctx.moveTo(sx, arcY);
        ctx.quadraticCurveTo((sx + tx) / 2, arcY + depth * 2, tx, arcY);
        ctx.stroke();
        // flat bar: the symbol for an inhibitory synapse
        const bar = Math.max(2, Math.min(5, L.cw * 0.4));
        ctx.lineWidth = Math.max(1.2, ctx.lineWidth);
        ctx.beginPath();
        ctx.moveTo(tx - bar, arcY + 1);
        ctx.lineTo(tx + bar, arcY + 1);
        ctx.stroke();
      });
    }

    // 5. The electrode on the recorded cell
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    roundRect(ctx, sx - uw / 2 - 3, L.unitTop - 3, uw + 6, L.unitH + 6, Math.min(uw / 2 + 3, 8));
    ctx.stroke();
    if (flash) {
      ctx.fillStyle = withAlpha(pal.focus, 0.55);
      roundRect(ctx, sx - uw / 2 - 3, L.unitTop - 3, uw + 6, L.unitH + 6, Math.min(uw / 2 + 3, 8));
      ctx.fill();
    }

    // 6. The graph: light (dashed) and firing (solid), on one 0–100 scale
    const P = (v: number) => L.plotBottom - clamp01(v) * (L.plotBottom - L.plotTop);
    ctx.font = `${fs * 0.85}px ${pal.mono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [0, 0.5, 1]) {
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(L.left, P(v));
      ctx.lineTo(w - L.right, P(v));
      ctx.stroke();
      ctx.fillStyle = pal.muted;
      ctx.fillText(String(Math.round(v * MAX_RATE)), L.left - 6, P(v));
    }
    ctx.save();
    ctx.translate(12, (L.plotTop + L.plotBottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = `${fs * 0.88}px ${pal.body}`;
    ctx.fillText(L.narrow ? '% · spikes/s' : '% light · spikes/s', 0, 0);
    ctx.restore();

    // recorded-cell guide
    ctx.strokeStyle = withAlpha(pal.accent, 0.6);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, L.plotTop - 4);
    ctx.lineTo(sx, L.plotBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // light: soft area + dashed line
    ctx.beginPath();
    ctx.moveTo(X(0), P(0));
    for (let i = 0; i < N; i++) ctx.lineTo(X(i), P(this.e[i]));
    ctx.lineTo(X(N - 1), P(0));
    ctx.closePath();
    ctx.fillStyle = withAlpha(pal.text, 0.07);
    ctx.fill();
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1.75;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    for (let i = 0; i < N; i++) (i ? ctx.lineTo(X(i), P(this.e[i])) : ctx.moveTo(X(i), P(this.e[i])));
    ctx.stroke();
    ctx.setLineDash([]);

    // firing
    ctx.strokeStyle = pal.excite;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N; i++) (i ? ctx.lineTo(X(i), P(this.r[i])) : ctx.moveTo(X(i), P(this.r[i])));
    ctx.stroke();
    if (L.cw >= 7) {
      ctx.fillStyle = pal.excite;
      for (let i = 0; i < N; i++) {
        ctx.beginPath();
        ctx.arc(X(i), P(this.r[i]), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(sx, P(this.r[sel]), 4.5, 0, Math.PI * 2);
    ctx.fill();

    // value tag for the recorded cell
    const tag = `${Math.round(this.r[sel] * MAX_RATE)} spikes/s`;
    ctx.font = `600 ${fs * 0.85}px ${pal.mono}`;
    const tw = ctx.measureText(tag).width + 10;
    let tx = sx + 8;
    if (tx + tw > w - L.right) tx = sx - 8 - tw;
    const ty = Math.max(L.plotTop, P(this.r[sel]) - 22);
    roundRect(ctx, tx, ty, tw, fs * 1.5, 4);
    ctx.fillStyle = withAlpha(pal.surface, 0.92);
    ctx.fill();
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, tx + 5, ty + fs * 0.75);

    // 7. What you see: the firing, rescaled so even areas keep their brightness
    for (let i = 0; i < N; i++) {
      ctx.fillStyle = grey(this.r[i] / gain);
      ctx.fillRect(L.left + i * L.cw, L.seenTop, L.cw + 0.6, L.seenH);
    }
    ctx.strokeStyle = pal.border;
    ctx.strokeRect(L.left + 0.5, L.seenTop + 0.5, L.cw * N - 1, L.seenH - 1);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx, L.seenTop - 5);
    ctx.lineTo(sx, L.seenTop - 1);
    ctx.stroke();
  }

  private paint(target: HTMLCanvasElement, data: Float32Array, scale: number): CanvasRenderingContext2D {
    if (!this.off) {
      this.off = document.createElement('canvas');
      this.off.width = IMG_W;
      this.off.height = IMG_H;
    }
    const octx = this.off.getContext('2d')!;
    const id = octx.createImageData(IMG_W, IMG_H);
    for (let i = 0; i < data.length; i++) {
      const g = Math.round(clamp01(data[i] * scale) * 255);
      id.data[4 * i] = g;
      id.data[4 * i + 1] = g;
      id.data[4 * i + 2] = g;
      id.data[4 * i + 3] = 255;
    }
    octx.putImageData(id, 0, 0);
    const { w, h } = fitCanvas(target);
    const ctx = target.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.off, 0, 0, w, h);
    return ctx;
  }

  private drawPictures(pal: Pal): void {
    const gain = uniformGain(this.eff);
    const inCtx = this.paint(this.inCanvas, this.img.data, 1);
    const outCtx = this.paint(this.outCanvas, this.rImg, 1 / gain);
    const rect = this.inCanvas.getBoundingClientRect();
    const k = rect.width / IMG_W;
    const pr = this.probe;
    const idx = Math.floor(pr.y) * IMG_W + Math.floor(pr.x);
    const width = this.sheet.widths[idx] || this.net.spread;

    // Receptive-field rings across the sheet: small where you look, larger in the periphery.
    if (this.gazeOn) {
      outCtx.strokeStyle = withAlpha(pal.accent, 0.45);
      outCtx.lineWidth = 1;
      const gap = k < 3.2 ? 32 : 16;
      for (let y = gap / 2; y < IMG_H; y += gap) {
        for (let x = gap / 2; x < IMG_W; x += gap) {
          const s = this.sheet.widths[y * IMG_W + x] || this.net.spread;
          outCtx.beginPath();
          outCtx.arc(x * k, y * k, s * 1.5 * k, 0, Math.PI * 2);
          outCtx.stroke();
        }
      }
    }

    if (this.probeShown || this.gazeOn) {
      for (const ctx of [inCtx, outCtx]) {
        const x = pr.x * k;
        const y = pr.y * k;
        // the surround of the cell under the pointer: 2σ ring
        ctx.strokeStyle = this.gazeOn ? pal.focus : pal.accent;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(x, y, Math.max(4, width * 2 * k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        if (this.gazeOn) {
          // an eye-like gaze mark
          ctx.beginPath();
          ctx.moveTo(x - 9, y);
          ctx.quadraticCurveTo(x, y - 7, x + 9, y);
          ctx.quadraticCurveTo(x, y + 7, x - 9, y);
          ctx.stroke();
          ctx.fillStyle = pal.focus;
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = pal.accent;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

if (!customElements.get('nc-lateral-inhibition')) customElements.define('nc-lateral-inhibition', LateralInhibitionElement);
