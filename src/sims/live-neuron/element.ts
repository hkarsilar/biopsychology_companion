import { SimElement, fmt } from '../shared/sim-element';
import { fitCanvas, readPalette, withAlpha } from '../shared/canvas';
import { setSetting, soundOn } from '../shared/settings';
import { click, unlockAudio } from '../shared/audio';
import { DT, EXC_AMP, INH_AMP, SPONT_AMP, Soma, THRESHOLD_MV, attenuation, travelDelay, type SomaInput } from './model';
import {
  buildGeometry,
  hitTest,
  pathLength,
  pathToSoma,
  pointAt,
  polyline,
  subPath,
  type Hit,
  type NeuronGeometry,
  type Polyline,
  type Pt,
} from './geometry';

/**
 * <nc-live-neuron>: the neuron on the home page. Poke its dendrites and watch the inputs
 * travel to the cell body, add up, and (if they cross threshold) fire a spike that leaps
 * from node to node along the myelinated axon to the terminals.
 *
 * Attributes:
 *   compact   hide the voltage trace (for tight spaces)
 *
 * The cell body is a Hodgkin–Huxley membrane (see ../action-potential/model.ts), shown
 * slowed down 500 times.
 */

/** Simulated milliseconds per real second (500× slower than life). */
const SPEED = 2;
/** Milliseconds of history in the voltage trace. */
const WINDOW = 20;
/** Trace sample interval (ms): one sample every two integration steps. */
const SAMPLE_STEPS = 2;
const N_SAMPLES = Math.round(WINDOW / (DT * SAMPLE_STEPS)) + 1;
/** Simulated time for the spike to leap from one node of Ranvier to the next (ms). */
const NODE_DELAY = 0.22;
/** Reduced motion: how long a spike stays lit (ms of simulated time, 1.2 s real). */
const STILL_FLASH = 2.4;
/** How far back an input still counts towards a spike, for the caption (ms). */
const SUMMATION_WINDOW = 6;

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

interface Signal {
  path: Polyline;
  t0: number;
  t1: number;
  kind: 'exc' | 'inh';
  strength: number;
  spontaneous: boolean;
  site: Pt;
}

interface Arrival {
  t: number;
  kind: 'exc' | 'inh';
  spontaneous: boolean;
}

type CaptionTone = 'hint' | 'exc' | 'inh' | 'spike';

const css = /* css */ `
:host { margin: 0; }
.wrap {
  display: grid;
  gap: 0.75rem;
  background: var(--surface, #151c2c);
  border: 1px solid var(--border, #2c3854);
  border-radius: var(--radius-l, 20px);
  box-shadow: var(--shadow);
  padding: 0.85rem;
}
.stage { position: relative; }
canvas.neuron {
  aspect-ratio: 1 / 1.02;
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: default;
  -webkit-tap-highlight-color: transparent;
}
canvas.neuron.pointing { cursor: pointer; }
@container (min-width: 520px) { canvas.neuron { aspect-ratio: 16 / 9; } }
@container (min-width: 900px) { canvas.neuron { aspect-ratio: 2.15 / 1; } }
.bottom { display: grid; gap: 0.75rem; align-items: start; }
@container (min-width: 720px) { .bottom { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); } }
canvas.trace {
  height: 112px;
  background: var(--bg, #0e1320);
  border: 1px solid var(--border, #2c3854);
  border-radius: var(--radius, 12px);
}
@container (max-width: 519px) { canvas.trace { height: 96px; } }
:host([compact]) canvas.trace { display: none; }
:host([compact]) .bottom { grid-template-columns: 1fr; }
.caption {
  margin: 0 0 0.6rem;
  min-height: 3.1em;
  display: flex;
  align-items: center;
  transition: border-color 0.3s;
}
.caption[data-tone='exc'] { border-left-color: var(--excite, #ff7a3d); }
.caption[data-tone='inh'] { border-left-color: var(--inhibit, #4aa3e8); }
.caption[data-tone='spike'] { border-left-color: var(--excite, #ff7a3d); font-weight: 700; }
.buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.buttons button { white-space: normal; text-align: left; }
.dot { width: 0.75em; height: 0.75em; border-radius: 50%; background: var(--excite, #ff7a3d); flex: none; }
.bar { width: 0.85em; height: 0.3em; border-radius: 2px; background: var(--inhibit, #4aa3e8); flex: none; }
button.sound { margin-left: auto; }
button.sound[aria-pressed='false'] .on, button.sound[aria-pressed='true'] .off { display: none; }
`;

export class LiveNeuronElement extends SimElement {
  private soma = new Soma();
  private canvas!: HTMLCanvasElement;
  private traceCanvas!: HTMLCanvasElement;
  private captionEl!: HTMLElement;
  private soundBtn!: HTMLButtonElement;
  private g: NeuronGeometry | null = null;
  private staticLayer: HTMLCanvasElement | null = null;
  private size = { w: 0, h: 0, dpr: 1 };
  private themeKey = '';
  private pal = this.blankPalette();

  private samples = new Float32Array(N_SAMPLES);
  private sampleHead = 0;
  private stepCount = 0;
  private simDebt = 0;
  private signals: Signal[] = [];
  private arrivals: Arrival[] = [];
  private spikes: number[] = [];
  private ripples: { at: Pt; t0: number; kind: 'exc' | 'inh' }[] = [];
  private hover: Hit = null;
  private siteCursor = 0;
  private realClock = 0;
  private lastUser = -Infinity;
  private nextSpont = 2.5;
  private interacted = false;
  private quietFor = 0;

  // Caption bookkeeping
  private armed = false;
  private lastUserArrival = -Infinity;
  /** Largest distance from rest since the last input arrived (mV) */
  private devSinceArrival = 0;
  private spikeSinceArrival = false;

  private blankPalette() {
    return {
      bg: '#0e1320',
      surface: '#151c2c',
      text: '#e9edf5',
      muted: '#a9b3c7',
      faint: '#7d889f',
      accent: '#b69cff',
      excite: '#ff7a3d',
      inhibit: '#4aa3e8',
      membrane: '#c9b38f',
      edge: '#8a7552',
      trace: '#f4f6fb',
      grid: 'rgba(169,179,199,.16)',
      border: '#2c3854',
      fontBody: 'system-ui, sans-serif',
      fontMono: 'ui-monospace, monospace',
    };
  }

  protected build(): void {
    this.html(`
      <style>${css}</style>
      <div class="wrap">
        <div class="stage">
          <canvas class="neuron" role="img"></canvas>
        </div>
        <div class="bottom">
          <canvas class="trace" role="img" aria-label="Voltage of the cell body over the last 20 milliseconds, slowed 500 times. Rest is −65 millivolts; the cell fires when it crosses threshold, about −55."></canvas>
          <div class="panel">
            <p class="caption" data-tone="hint"></p>
            <div class="buttons">
              <button class="excite" type="button"><span class="dot" aria-hidden="true"></span>Poke a dendrite</button>
              <button class="inhibit" type="button"><span class="bar" aria-hidden="true"></span>Poke the inhibitory synapse</button>
              <button class="sound" type="button" aria-pressed="false" title="Spike clicks"><span aria-hidden="true" class="on">🔊</span><span aria-hidden="true" class="off">🔈</span><span class="visually-hidden">Sound</span></button>
            </div>
          </div>
        </div>
      </div>`);
    this.canvas = this.$('canvas.neuron') as HTMLCanvasElement;
    this.traceCanvas = this.$('canvas.trace') as HTMLCanvasElement;
    this.captionEl = this.$('.caption');
    this.soundBtn = this.$('button.sound') as HTMLButtonElement;
    this.samples.fill(this.soma.restV);
    this.setCaption('Poke a dendrite to send this neuron a signal. Can you make it fire?', 'hint');
    this.syncSound();

    this.$('button.excite').addEventListener('click', () => this.pokeSite());
    this.$('button.inhibit').addEventListener('click', () => this.pokeInhibitory());
    this.soundBtn.addEventListener('click', () => {
      unlockAudio();
      setSetting('sound', !soundOn());
      this.syncSound();
    });
    this.canvas.addEventListener('click', (e) => this.onCanvasClick(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.canvas.classList.remove('pointing');
      if (!this.playing) this.render();
    });
    this.play();
  }

  protected onSettings(): void {
    this.syncSound();
    if (!this.reducedMotion && !this.playing) this.play();
  }

  private syncSound() {
    this.soundBtn?.setAttribute('aria-pressed', String(soundOn()));
  }

  // ---------- Interaction ----------

  private userAction() {
    unlockAudio();
    this.interacted = true;
    this.lastUser = this.realClock;
    this.quietFor = 0;
    if (!this.playing) this.play();
  }

  /** Excite one of the drawn synapses, in turn (the "Poke a dendrite" button). */
  pokeSite(): void {
    const g = this.ensureGeometry();
    if (!g) return;
    const site = g.sites[this.siteCursor % g.sites.length];
    this.siteCursor++;
    this.excite(site.branch, site.s, false);
  }

  pokeInhibitory(): void {
    const g = this.ensureGeometry();
    if (!g) return;
    this.userAction();
    const t0 = this.soma.t;
    const delay = 0.3;
    const path = polyline([g.inhib.bouton, g.inhib.contact, g.soma]);
    this.signals.push({ path, t0, t1: t0 + delay, kind: 'inh', strength: 1, spontaneous: false, site: g.inhib.bouton });
    this.ripples.push({ at: g.inhib.bouton, t0, kind: 'inh' });
    this.soma.schedule({ t: t0 + delay, amp: -INH_AMP, kind: 'inh' });
  }

  private excite(branch: number, s: number, spontaneous: boolean) {
    const g = this.g;
    if (!g) return;
    if (!spontaneous) this.userAction();
    const frac = pathLength(g, branch, s) / g.maxPath;
    const strength = attenuation(frac);
    const t0 = this.soma.t;
    const t1 = t0 + travelDelay(frac);
    const path = pathToSoma(g, branch, s);
    const site = path.pts[0];
    this.signals.push({ path, t0, t1, kind: 'exc', strength, spontaneous, site });
    if (!spontaneous) this.ripples.push({ at: site, t0, kind: 'exc' });
    this.soma.schedule({ t: t1, amp: (spontaneous ? SPONT_AMP : EXC_AMP) * strength, kind: 'exc', spontaneous });
  }

  private pointerHit(e: PointerEvent | MouseEvent): Hit {
    const g = this.g;
    if (!g) return null;
    const touch = 'pointerType' in e && (e as PointerEvent).pointerType === 'touch';
    return hitTest(g, e.offsetX, e.offsetY, touch ? 16 : 9);
  }

  private onCanvasClick(e: MouseEvent) {
    const hit = this.pointerHit(e);
    if (!hit) return;
    if (hit.kind === 'dendrite') this.excite(hit.branch, hit.s, false);
    else if (hit.kind === 'inhib') this.pokeInhibitory();
    else if (hit.kind === 'soma')
      this.setCaption('That’s the cell body, where inputs add up. Poke the dendrites, or the blue inhibitory synapse.', 'hint', true);
    else if (hit.kind === 'axon')
      this.setCaption('That’s the axon: it carries spikes away to the terminals. Inputs arrive on the dendrites.', 'hint', true);
  }

  private onPointerMove(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    const hit = this.pointerHit(e);
    const before = JSON.stringify(this.hover);
    this.hover = hit && (hit.kind === 'dendrite' || hit.kind === 'inhib') ? hit : null;
    this.canvas.classList.toggle('pointing', !!hit);
    if (!this.playing && JSON.stringify(this.hover) !== before) this.render();
  }

  // ---------- Simulation ----------

  reset(): void {
    this.soma.reset();
    this.samples.fill(this.soma.restV);
    this.signals = [];
    this.arrivals = [];
    this.spikes = [];
    this.ripples = [];
    this.armed = false;
  }

  stepOnce(): void {
    this.advance(DT * SAMPLE_STEPS);
    this.render();
  }

  protected tick(dtReal: number): void {
    this.realClock += dtReal;
    this.simDebt += dtReal * SPEED;
    this.advance(0);
    this.spontaneous();
    this.updateCaption();
    this.prune();
    // With reduced motion, stop the loop once everything has settled, so nothing moves.
    if (this.reducedMotion) {
      const settled = Math.abs(this.soma.V - this.soma.restV) < 1 && Math.abs(this.soma.current) < 0.05;
      const busy = this.signals.length || this.soma.pending || !settled || this.flashing();
      this.quietFor = busy ? 0 : this.quietFor + dtReal;
      if (this.quietFor > 0.4) this.pause();
    }
  }

  private advance(extra: number) {
    this.simDebt += extra;
    while (this.simDebt >= DT) {
      this.simDebt -= DT;
      this.soma.advance(DT, {
        onArrival: (input) => this.onArrival(input),
        onSpike: (t) => this.onSpike(t),
      });
      if (this.armed) this.devSinceArrival = Math.max(this.devSinceArrival, Math.abs(this.soma.V - this.soma.restV));
      if (++this.stepCount % SAMPLE_STEPS === 0) {
        this.samples[this.sampleHead] = this.soma.V;
        this.sampleHead = (this.sampleHead + 1) % N_SAMPLES;
      }
    }
  }

  private onArrival(input: SomaInput) {
    this.arrivals.push({ t: input.t, kind: input.kind, spontaneous: !!input.spontaneous });
    if (input.spontaneous) return;
    this.armed = true;
    this.lastUserArrival = input.t;
    this.devSinceArrival = Math.abs(this.soma.V - this.soma.restV);
    this.spikeSinceArrival = false;
    const recentSpike = this.spikes.length && input.t - this.spikes[this.spikes.length - 1] < 3;
    if (recentSpike) return;
    if (input.kind === 'exc') this.setCaption('The signal reaches the cell body and the voltage bumps up…', 'exc');
    else this.setCaption('Inhibition: the voltage dips, away from threshold.', 'inh');
  }

  private onSpike(t: number) {
    const prev = this.spikes[this.spikes.length - 1];
    this.spikes.push(t);
    this.spikeSinceArrival = true;
    this.armed = false;
    if (soundOn()) click(1, 0.35);
    const n = this.arrivals.filter((a) => a.kind === 'exc' && !a.spontaneous && t - a.t <= SUMMATION_WINDOW && a.t <= t).length;
    let text: string;
    if (prev !== undefined && t - prev < 12) text = 'Another spike! Keep the inputs coming and the neuron keeps firing.';
    else if (n >= 2) text = `${NUMBER_WORDS[Math.min(n, 9)]} inputs added up past threshold: spike!`;
    else text = 'That input tipped the cell past threshold: spike!';
    this.setCaption(text, 'spike', true);
  }

  /** Once a bump has peaked and is fading without a spike, say why. */
  private updateCaption() {
    if (!this.armed || this.spikeSinceArrival) return;
    const t = this.soma.t;
    const inFlight = this.signals.some((s) => !s.spontaneous && s.t1 > t);
    if (inFlight || t - this.lastUserArrival < 1.2) return;
    const dev = Math.abs(this.soma.V - this.soma.restV);
    const fading = dev < this.devSinceArrival - 0.8 || dev < 0.3;
    if (!fading) return;
    this.armed = false;
    const recent = this.arrivals.filter((a) => !a.spontaneous && this.lastUserArrival - a.t <= 6);
    const exc = recent.filter((a) => a.kind === 'exc').length;
    const inh = recent.filter((a) => a.kind === 'inh').length;
    const lastSpike = this.spikes[this.spikes.length - 1];
    if (lastSpike !== undefined && this.lastUserArrival - lastSpike < 7 && exc > 0)
      this.setCaption('Right after a spike the neuron is refractory: it needs a moment before it can fire again.', 'hint', true);
    else if (exc && inh) this.setCaption('Inhibition cancels excitation: the neuron stays quiet.', 'inh', true);
    else if (inh) this.setCaption('Inhibition pulls the voltage down, away from threshold. Try it together with a few pokes.', 'inh', true);
    else if (exc === 1) this.setCaption('Below threshold: the bump fades. Try two or three quick pokes.', 'exc', true);
    else this.setCaption(`${NUMBER_WORDS[Math.min(exc, 9)]} inputs, but too far apart in time: each bump faded first. Poke faster!`, 'exc', true);
  }

  /** Faint background inputs now and then, so the cell never looks dead. Never enough to fire it. */
  private spontaneous() {
    const g = this.g;
    if (!g || this.reducedMotion) return;
    if (this.realClock < this.nextSpont) return;
    this.nextSpont = this.realClock + 2.2 + Math.random() * 3.5;
    if (this.realClock - this.lastUser < 5) return;
    const leafs = g.dendrites.map((_, i) => i).filter((i) => g.dendrites[i].depth >= 1);
    const bi = leafs[Math.floor(Math.random() * leafs.length)];
    this.excite(bi, g.dendrites[bi].len * (0.3 + Math.random() * 0.65), true);
  }

  private prune() {
    const t = this.soma.t;
    this.signals = this.signals.filter((s) => t - s.t1 < 0.6);
    this.ripples = this.ripples.filter((r) => t - r.t0 < 1.5);
    this.arrivals = this.arrivals.filter((a) => t - a.t < WINDOW + 1);
    const tail = this.g ? (this.g.jumps.length + 12) * NODE_DELAY : 4;
    while (this.spikes.length > 1 && t - this.spikes[0] > Math.max(WINDOW, tail)) this.spikes.shift();
  }

  private flashing(): boolean {
    const last = this.spikes[this.spikes.length - 1];
    return last !== undefined && this.soma.t - last < STILL_FLASH + 0.2;
  }

  private setCaption(text: string, tone: CaptionTone, announce = false) {
    if (!this.captionEl) return;
    if (this.captionEl.textContent !== text) this.captionEl.textContent = text;
    this.captionEl.dataset.tone = tone;
    if (announce) this.announce(text, tone === 'spike', 1500);
  }

  // ---------- Drawing ----------

  private ensureGeometry(): NeuronGeometry | null {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 10 || h < 10) return this.g;
    const theme = document.documentElement.dataset.theme ?? 'dark';
    const sizeChanged = w !== this.size.w || h !== this.size.h;
    if (!sizeChanged && theme === this.themeKey && this.g) return this.g;
    this.themeKey = theme;
    this.pal = readPalette(this, {
      bg: '--bg',
      surface: '--surface',
      text: '--text',
      muted: '--text-muted',
      faint: '--text-faint',
      accent: '--accent',
      excite: '--excite',
      inhibit: '--inhibit',
      membrane: '--membrane',
      edge: '--membrane-edge',
      trace: '--trace',
      grid: '--grid',
      border: '--border',
      fontBody: '--font-body',
      fontMono: '--font-mono',
    });
    this.size = fitCanvas(this.canvas);
    const ctx = this.canvas.getContext('2d')!;
    ctx.font = this.labelFont();
    this.g = buildGeometry(this.size.w, this.size.h, (t) => ctx.measureText(t).width, this.fontPx());
    this.canvas.setAttribute(
      'aria-label',
      `A neuron: branching dendrites ${this.g.vertical ? 'at the top' : 'on the left'}, a cell body, and a myelinated axon ending in terminals. ` +
        'Poke the dendrites to send it signals; a blue inhibitory synapse sits on the cell body.',
    );
    this.drawStatic();
    return this.g;
  }

  private fontPx() {
    return this.size.w < 560 ? 11 : 12.5;
  }

  private labelFont() {
    return `600 ${this.fontPx()}px ${this.pal.fontBody}`;
  }

  private isLight() {
    return this.themeKey === 'light';
  }

  protected render(): void {
    if (!this.canvas) return;
    const g = this.ensureGeometry();
    if (!g || !this.staticLayer) return;
    const ctx = this.canvas.getContext('2d')!;
    const { w, h } = this.size;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.staticLayer, 0, 0, w, h);
    this.drawHover(ctx, g);
    this.drawSoma(ctx, g);
    this.drawSignals(ctx);
    this.drawSpikes(ctx, g);
    this.drawHint(ctx, g);
    if (!this.hasAttribute('compact')) this.drawTrace();
  }

  /** Stroke a polyline whose width changes from w0 to w1 along its length. */
  private taper(ctx: CanvasRenderingContext2D, pts: Pt[], w0: number, w1: number) {
    for (let i = 0; i < pts.length - 1; i++) {
      ctx.lineWidth = w0 + ((w1 - w0) * i) / Math.max(1, pts.length - 2);
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
  }

  private path(ctx: CanvasRenderingContext2D, pts: Pt[], close = false) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (close) ctx.closePath();
  }

  private drawStatic() {
    const g = this.g!;
    const { w, h, dpr } = this.size;
    const layer = this.staticLayer ?? document.createElement('canvas');
    layer.width = Math.round(w * dpr);
    layer.height = Math.round(h * dpr);
    this.staticLayer = layer;
    const ctx = layer.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = this.pal;
    const light = this.isLight();
    const edgeW = 2.4;
    const myelinFill = light ? '#fffdf8' : withAlpha(p.text, 0.9);
    const myelinEdge = light ? p.edge : withAlpha(p.muted, 0.9);

    // Synaptic fibres arriving from other neurons (behind everything)
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(p.excite, 0.35);
    for (const s of g.sites) {
      ctx.beginPath();
      ctx.moveTo(s.marker.x, s.marker.y);
      ctx.lineTo(s.fiberEnd.x, s.fiberEnd.y);
      ctx.stroke();
    }
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = withAlpha(p.inhibit, 0.6);
    this.path(ctx, g.inhib.fiber);
    ctx.stroke();

    // Pass 1: outlines
    ctx.strokeStyle = p.edge;
    ctx.fillStyle = p.edge;
    for (const b of g.dendrites) this.taper(ctx, b.pts, b.w0 + edgeW, b.w1 + edgeW);
    ctx.lineWidth = g.axonWidth + edgeW;
    this.path(ctx, g.axon.pts);
    ctx.stroke();
    for (const b of g.terminals) this.taper(ctx, b.pts, b.w0 + edgeW, b.w1 + edgeW);
    for (const b of g.boutons) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, g.boutonR + edgeW / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = edgeW;
    this.path(ctx, g.somaOutline, true);
    ctx.stroke();
    this.path(ctx, g.hillock, true);
    ctx.stroke();

    // Dendritic spines: tiny stubs along the finer branches
    ctx.strokeStyle = p.membrane;
    ctx.fillStyle = p.membrane;
    ctx.lineWidth = 1.2;
    let flip = 1;
    for (const b of g.dendrites) {
      if (b.depth === 0) continue;
      for (let s = 7; s < b.len - 4; s += 11) {
        const a = pointAt(b, s);
        const nxt = pointAt(b, Math.min(b.len, s + 1));
        const d = Math.hypot(nxt.x - a.x, nxt.y - a.y) || 1;
        const n = { x: -(nxt.y - a.y) / d, y: (nxt.x - a.x) / d };
        flip = -flip;
        const half = (b.w0 + (b.w1 - b.w0) * (s / b.len)) / 2;
        const tip = { x: a.x + n.x * flip * (half + 2.6), y: a.y + n.y * flip * (half + 2.6) };
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(tip.x, tip.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pass 2: fill
    ctx.strokeStyle = p.membrane;
    ctx.fillStyle = p.membrane;
    for (const b of g.dendrites) this.taper(ctx, b.pts, b.w0, b.w1);
    ctx.lineWidth = g.axonWidth;
    this.path(ctx, g.axon.pts);
    ctx.stroke();
    for (const b of g.terminals) this.taper(ctx, b.pts, b.w0, b.w1);
    for (const b of g.boutons) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, g.boutonR - edgeW / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    this.path(ctx, g.somaOutline, true);
    ctx.fill();
    this.path(ctx, g.hillock, true);
    ctx.fill();

    // Nucleus
    ctx.fillStyle = withAlpha(p.edge, 0.45);
    ctx.beginPath();
    ctx.arc(g.nucleus.x, g.nucleus.y, g.R * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(p.edge, 0.85);
    ctx.beginPath();
    ctx.arc(g.nucleus.x + g.R * 0.08, g.nucleus.y - g.R * 0.06, g.R * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // Myelin sheaths: pearly capsules with gaps (nodes of Ranvier) between them
    for (const [s0, s1] of g.myelin) {
      const pts = subPath(g.axon, s0, s1);
      ctx.strokeStyle = myelinEdge;
      ctx.lineWidth = g.myelinWidth + 2;
      this.path(ctx, pts);
      ctx.stroke();
      ctx.strokeStyle = myelinFill;
      ctx.lineWidth = g.myelinWidth - 0.5;
      this.path(ctx, pts);
      ctx.stroke();
    }

    // Presynaptic terminals from other cells: orange (excitatory) on the dendrites, blue (inhibitory) on the soma
    for (const s of g.sites) {
      ctx.fillStyle = p.excite;
      ctx.beginPath();
      ctx.arc(s.marker.x, s.marker.y, g.markerR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = p.inhibit;
    ctx.beginPath();
    ctx.arc(g.inhib.bouton.x, g.inhib.bouton.y, g.inhib.r, 0, Math.PI * 2);
    ctx.fill();
    // A bar on the blue terminal: the usual symbol for an inhibitory synapse
    const bx = g.inhib.contact.x - g.inhib.bouton.x;
    const by = g.inhib.contact.y - g.inhib.bouton.y;
    const bl = Math.hypot(bx, by) || 1;
    const nx = -by / bl;
    const ny = bx / bl;
    ctx.strokeStyle = p.surface;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(g.inhib.bouton.x - nx * g.inhib.r * 0.5, g.inhib.bouton.y - ny * g.inhib.r * 0.5);
    ctx.lineTo(g.inhib.bouton.x + nx * g.inhib.r * 0.5, g.inhib.bouton.y + ny * g.inhib.r * 0.5);
    ctx.stroke();

    // Labels
    ctx.font = this.labelFont();
    for (const l of g.labels) {
      if (l.leader) {
        ctx.strokeStyle = withAlpha(p.muted, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(l.leader[0].x, l.leader[0].y);
        ctx.lineTo(l.leader[1].x, l.leader[1].y);
        ctx.stroke();
      }
      ctx.textAlign = l.align;
      ctx.textBaseline = l.baseline;
      ctx.lineWidth = 4;
      ctx.strokeStyle = withAlpha(p.surface, 0.9);
      ctx.strokeText(l.text, l.x, l.y);
      ctx.fillStyle = p.muted;
      ctx.fillText(l.text, l.x, l.y);
    }
  }

  private glow(ctx: CanvasRenderingContext2D, color: string, blur: number) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
  }

  private noGlow(ctx: CanvasRenderingContext2D) {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  private drawHover(ctx: CanvasRenderingContext2D, g: NeuronGeometry) {
    const hv = this.hover;
    if (!hv) return;
    ctx.save();
    ctx.lineCap = 'round';
    if (hv.kind === 'dendrite') {
      const b = g.dendrites[hv.branch];
      ctx.strokeStyle = withAlpha(this.pal.excite, 0.35);
      this.taper(ctx, b.pts, b.w0 + 5, b.w1 + 5);
      ctx.fillStyle = this.pal.excite;
      ctx.beginPath();
      ctx.arc(hv.at.x, hv.at.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (hv.kind === 'inhib') {
      ctx.strokeStyle = this.pal.inhibit;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(g.inhib.bouton.x, g.inhib.bouton.y, g.inhib.r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawSoma(ctx: CanvasRenderingContext2D, g: NeuronGeometry) {
    const V = this.soma.V;
    const dv = V - this.soma.restV;
    const p = this.pal;
    ctx.save();
    if (dv > 0.15) {
      const spiking = V > -40;
      const a = spiking ? 0.92 : Math.min(0.7, dv / 12);
      if (spiking) this.glow(ctx, p.excite, 28);
      ctx.fillStyle = withAlpha(p.excite, a);
      this.path(ctx, g.somaOutline, true);
      ctx.fill();
      if (V > -50) {
        ctx.fillStyle = withAlpha(p.excite, Math.min(1, (V + 50) / 25));
        this.path(ctx, g.hillock, true);
        ctx.fill();
      }
    } else if (dv < -0.15) {
      ctx.fillStyle = withAlpha(p.inhibit, Math.min(0.6, -dv / 5));
      this.path(ctx, g.somaOutline, true);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawSignals(ctx: CanvasRenderingContext2D) {
    const t = this.soma.t;
    const p = this.pal;
    ctx.save();
    for (const r of this.ripples) {
      const e = t - r.t0;
      const color = r.kind === 'exc' ? p.excite : p.inhibit;
      if (this.reducedMotion) {
        if (e > 1.4) continue;
        ctx.strokeStyle = withAlpha(color, 0.9);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.at.x, r.at.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      const q = e / 0.5;
      if (q > 1) continue;
      ctx.strokeStyle = withAlpha(color, 0.8 * (1 - q));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.at.x, r.at.y, 4 + q * 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!this.reducedMotion) {
      for (const s of this.signals) {
        const q = (t - s.t0) / (s.t1 - s.t0);
        if (q < 0 || q > 1) continue;
        const color = s.kind === 'exc' ? p.excite : p.inhibit;
        const alpha = s.spontaneous ? 0.45 : 1;
        // The signal shrinks as it travels: dendrites leak, so distant inputs arrive weaker.
        const fade = 1 - (1 - s.strength) * q * 1.6;
        const r0 = (s.spontaneous ? 3 : 5.5) * Math.max(0.45, fade);
        const head = q * s.path.len;
        for (let k = 6; k >= 0; k--) {
          const pos = pointAt(s.path, Math.max(0, head - k * r0 * 0.9));
          ctx.fillStyle = withAlpha(color, alpha * (k === 0 ? 1 : 0.5 * (1 - k / 7)));
          if (k === 0) this.glow(ctx, color, 14);
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, k === 0 ? r0 : r0 * (1 - k / 9), 0, Math.PI * 2);
          ctx.fill();
          this.noGlow(ctx);
        }
      }
    } else {
      // Still frames: mark the synapse until the signal arrives.
      for (const s of this.signals) {
        if (t > s.t1 || s.spontaneous) continue;
        ctx.fillStyle = s.kind === 'exc' ? p.excite : p.inhibit;
        ctx.beginPath();
        ctx.arc(s.site.x, s.site.y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawSpikes(ctx: CanvasRenderingContext2D, g: NeuronGeometry) {
    const t = this.soma.t;
    const p = this.pal;
    const K = g.jumps.length - 1;
    const pos = g.jumps.map((s) => pointAt(g.axon, s));
    ctx.save();
    for (const t0 of this.spikes) {
      const e = t - t0;
      if (e < 0) continue;
      const tT = K * NODE_DELAY + 0.08;
      if (this.reducedMotion) {
        if (e > STILL_FLASH) continue;
        this.glow(ctx, p.excite, 12);
        ctx.fillStyle = withAlpha(p.excite, 0.95);
        for (const q of pos) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, g.axonWidth * 0.9 + 3, 0, Math.PI * 2);
          ctx.fill();
        }
        this.drawTerminalFlash(ctx, g, 1, 0.5);
        this.noGlow(ctx);
        continue;
      }
      if (e > tT + 3) continue;
      // Each node flares as the spike reaches it, then fades.
      for (let k = 0; k <= K; k++) {
        const tk = k * NODE_DELAY;
        if (e < tk) break;
        const I = Math.exp(-(e - tk) / 0.55);
        if (I < 0.02) continue;
        this.glow(ctx, p.excite, 18 * I);
        ctx.fillStyle = withAlpha(p.excite, I);
        ctx.beginPath();
        ctx.arc(pos[k].x, pos[k].y, g.axonWidth * 0.9 + 4 * I + 1.5, 0, Math.PI * 2);
        ctx.fill();
        this.noGlow(ctx);
      }
      // The leap: an arc from node to node over the insulating myelin (saltatory conduction).
      for (let k = 1; k <= K; k++) {
        const ta = (k - 1) * NODE_DELAY;
        const q = (e - ta) / NODE_DELAY;
        if (q < 0) break;
        const fadeArc = q > 1 ? Math.exp(-(q - 1) * 1.6) * 0.35 : 0.9;
        if (fadeArc < 0.03) continue;
        this.drawLeap(ctx, g, k, Math.min(1, q), withAlpha(p.excite, fadeArc), q <= 1);
      }
      if (e >= tT) {
        const u = e - tT;
        this.drawTerminalFlash(ctx, g, Math.exp(-u / 0.6), u);
      }
    }
    ctx.restore();
  }

  private drawLeap(ctx: CanvasRenderingContext2D, g: NeuronGeometry, k: number, q: number, color: string, head: boolean) {
    const s0 = g.jumps[k - 1];
    const s1 = g.jumps[k];
    const a = pointAt(g.axon, s0);
    const b = pointAt(g.axon, s1);
    const mid = pointAt(g.axon, (s0 + s1) / 2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    // Bulge to the "upper" side of the axon (screen up for horizontal, left for vertical).
    let nx = dy / d;
    let ny = -dx / d;
    if ((g.vertical && nx > 0) || (!g.vertical && ny > 0)) {
      nx = -nx;
      ny = -ny;
    }
    const lift = g.myelinWidth * 0.9 + d * 0.12;
    const c = { x: mid.x + nx * lift, y: mid.y + ny * lift };
    const steps = 14;
    const n = Math.max(1, Math.round(steps * q));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let last = a;
    for (let i = 0; i <= n; i++) {
      const t = (i / steps) * 1;
      const pt = {
        x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
        y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
      };
      if (i) ctx.lineTo(pt.x, pt.y);
      else ctx.moveTo(pt.x, pt.y);
      last = pt;
    }
    ctx.stroke();
    if (head) {
      this.glow(ctx, this.pal.excite, 10);
      ctx.fillStyle = this.pal.excite;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
      ctx.fill();
      this.noGlow(ctx);
    }
  }

  /** Terminals light up and release a puff of transmitter. `u` is time since arrival (ms). */
  private drawTerminalFlash(ctx: CanvasRenderingContext2D, g: NeuronGeometry, I: number, u: number) {
    const p = this.pal;
    if (I > 0.02) {
      this.glow(ctx, p.excite, 16 * I);
      ctx.fillStyle = withAlpha(p.excite, 0.85 * I);
      for (const b of g.boutons) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, g.boutonR + 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = withAlpha(p.excite, 0.6 * I);
      ctx.lineCap = 'round';
      for (const b of g.terminals) this.taper(ctx, b.pts, b.w0 + 1, b.w1 + 1);
      this.noGlow(ctx);
    }
    // Vesicles: little dots drifting out of each terminal
    const life = 1.4;
    if (u > life) return;
    const end = pointAt(g.axon, g.axon.len);
    ctx.fillStyle = withAlpha(p.accent, 0.9 * (1 - u / life));
    g.boutons.forEach((b, i) => {
      const base = Math.atan2(b.y - end.y, b.x - end.x);
      for (let j = 0; j < 4; j++) {
        const a = base + (j - 1.5) * 0.42 + Math.sin(i * 7.3 + j * 3.1) * 0.15;
        const dist = g.boutonR + 2 + u * g.boutonR * (2.2 + ((i + j) % 3) * 0.5);
        ctx.beginPath();
        ctx.arc(b.x + Math.cos(a) * dist, b.y + Math.sin(a) * dist, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /** A soft pulsing ring on one synapse until the visitor first pokes the neuron. */
  private drawHint(ctx: CanvasRenderingContext2D, g: NeuronGeometry) {
    if (this.interacted || this.reducedMotion) return;
    const s = g.sites[0];
    const q = (this.realClock % 1.8) / 1.8;
    ctx.save();
    ctx.strokeStyle = withAlpha(this.pal.excite, 0.75 * (1 - q));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.at.x, s.at.y, 6 + q * 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTrace() {
    const c = this.traceCanvas;
    const { w, h } = fitCanvas(c);
    if (w < 20) return;
    const ctx = c.getContext('2d')!;
    const p = this.pal;
    ctx.clearRect(0, 0, w, h);
    const padL = 40;
    const padR = 10;
    const top = 26;
    const bottom = h - 18;
    const yMid = top + (bottom - top) * 0.4;
    // A split scale: the small bumps below −50 mV get room; spikes are squeezed into the top.
    const y = (V: number) =>
      V <= -50 ? yMid + ((-50 - V) / 25) * (bottom - yMid) : yMid - ((Math.min(V, 45) + 50) / 95) * (yMid - top);
    const x = (i: number) => padL + (i / (N_SAMPLES - 1)) * (w - padL - padR);

    ctx.font = `600 11px ${p.fontBody}`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = p.muted;
    ctx.textAlign = 'left';
    ctx.fillText('Cell body voltage · slowed 500×', 10, 13);
    ctx.font = `600 12px ${p.fontMono}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = p.text;
    ctx.fillText(`${fmt(this.soma.V, 1)} mV`, w - 10, 13);

    const line = (V: number, color: string, dash: number[] = []) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y(V));
      ctx.lineTo(w - padR, y(V));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(0, p.grid);
    line(this.soma.restV, withAlpha(p.muted, 0.35));
    line(THRESHOLD_MV, withAlpha(p.excite, 0.75), [5, 4]);
    ctx.font = `10.5px ${p.fontMono}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = p.faint;
    ctx.fillText('0', padL - 6, y(0));
    ctx.fillText(fmt(THRESHOLD_MV, 0), padL - 6, y(THRESHOLD_MV));
    ctx.fillText(fmt(this.soma.restV, 0), padL - 6, y(this.soma.restV) + 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = withAlpha(p.excite, 0.9);
    ctx.fillText('threshold', padL + 10, y(THRESHOLD_MV) - 7);
    // Mark the change of scale on the axis.
    ctx.strokeStyle = p.faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL - 4, yMid - 3);
    ctx.lineTo(padL + 2, yMid - 6);
    ctx.moveTo(padL - 4, yMid + 1);
    ctx.lineTo(padL + 2, yMid - 2);
    ctx.stroke();

    // Voltage
    ctx.strokeStyle = p.trace;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N_SAMPLES; i++) {
      const V = this.samples[(this.sampleHead + i) % N_SAMPLES];
      if (i) ctx.lineTo(x(i), y(V));
      else ctx.moveTo(x(i), y(V));
    }
    ctx.stroke();

    // Inputs arriving: ▲ excitatory, ▼ inhibitory
    const tNow = this.soma.t;
    for (const a of this.arrivals) {
      const age = tNow - a.t;
      if (age < 0 || age > WINDOW) continue;
      const xi = padL + (1 - age / WINDOW) * (w - padL - padR);
      const r = a.spontaneous ? 2.5 : 4;
      ctx.fillStyle = a.kind === 'exc' ? withAlpha(p.excite, a.spontaneous ? 0.45 : 1) : p.inhibit;
      ctx.beginPath();
      if (a.kind === 'exc') {
        ctx.moveTo(xi, bottom + 4);
        ctx.lineTo(xi + r, bottom + 4 + r * 1.6);
        ctx.lineTo(xi - r, bottom + 4 + r * 1.6);
      } else {
        ctx.moveTo(xi, bottom + 4 + r * 1.6);
        ctx.lineTo(xi + r, bottom + 4);
        ctx.lineTo(xi - r, bottom + 4);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
}

if (!customElements.get('nc-live-neuron')) customElements.define('nc-live-neuron', LiveNeuronElement);

declare global {
  interface HTMLElementTagNameMap {
    'nc-live-neuron': LiveNeuronElement;
  }
}
