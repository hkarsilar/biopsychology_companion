import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { drawIon, fitCanvas, readPalette, rng, roundRect, withAlpha } from '../shared/canvas';
import { click, unlockAudio } from '../shared/audio';
import { setSetting, soundOn } from '../shared/settings';
import { forces, IONS, ionsInside, ionsToCharge, ION_ORDER, type IonId } from './ions';
import { MV_PER_ION, TugModel, type Crossing } from './model';

/**
 * <nc-resting-potential>: the ion tug-of-war. One kind of ion leaks through its channels.
 * Every ion that crosses leaves a little charge behind, and the voltage builds until the
 * electrical pull balances the concentration push: the Nernst potential.
 *
 * Attributes: preset, ion ("k" | "na" | "cl"), cin, cout, temp, predict, present, lab-href.
 */

interface Preset {
  ion: IonId;
  cIn?: number;
  cOut?: number;
  tempC?: number;
  open?: boolean;
  caption?: string;
}

export const TUG_PRESETS: Record<string, Preset> = {
  potassium: { ion: 'k', open: false },
  'potassium-open': { ion: 'k', open: true },
  sodium: { ion: 'na', open: true, caption: 'Now only sodium can cross. Na⁺ is crowded outside, so it rushes in.' },
  chloride: { ion: 'cl', open: true, caption: 'Now only chloride can cross. Cl⁻ is crowded outside, and it carries negative charge.' },
  equal: { ion: 'k', cIn: 140, cOut: 140, open: true, caption: 'The same K⁺ concentration on both sides: no push, so no voltage builds.' },
  'more-outside': {
    ion: 'k',
    cOut: 20,
    open: true,
    caption: 'Four times more K⁺ outside than usual. The push is weaker, so the voltage settles less negative.',
  },
  cold: { ion: 'k', tempC: 5, open: true, caption: 'A cold cell, at 5 °C. Ions jiggle less, so a smaller voltage is enough to hold them back.' },
};

const SPEEDS = [0.5, 1, 2, 4];
/** Like fmt, with a plus sign on positive values. */
const sfmt = (x: number, d: number): string => (Number(x.toFixed(d)) > 0 ? '+' : '') + fmt(x, d);

const WINDOW = 40; // seconds of history in the trace
const CMIN = 1;
const CMAX = 500;

const toSlider = (c: number) => (Math.log10(Math.min(CMAX, Math.max(CMIN, c))) / Math.log10(CMAX)) * 100;
const fromSlider = (p: number) => {
  const c = 10 ** ((p / 100) * Math.log10(CMAX));
  return c < 10 ? Math.round(c * 10) / 10 : Math.round(c);
};

function openQuestion(ion: IonId): PredictQuestion {
  if (ion === 'na')
    return {
      id: 'open-na',
      question: 'Only sodium channels open. Na⁺ is crowded outside. Where will the voltage inside settle?',
      options: ['Near −90 mV, like potassium.', 'At 0 mV.', 'Positive, near +67 mV.'],
      correct: 2,
      explain: 'Na⁺ flows in and brings positive charge with it, so the inside turns positive until that charge pushes back as hard as the crowd outside pushes in.',
    };
  if (ion === 'cl')
    return {
      id: 'open-cl',
      question: 'Only chloride channels open. Cl⁻ is crowded outside and carries negative charge. Where will the voltage inside settle?',
      options: ['Positive.', 'Negative, near −64 mV.', 'At 0 mV.'],
      correct: 1,
      explain: 'Cl⁻ flows in and brings negative charge with it, so the inside turns negative until that charge repels further Cl⁻ as hard as the crowd outside pushes it in.',
    };
  return {
    id: 'open-k',
    question: 'The potassium channels are about to open. K⁺ is crowded inside. What will happen to the voltage inside the cell?',
    options: [
      'It becomes more negative, then levels off.',
      'It keeps falling until the K⁺ is the same on both sides.',
      'Nothing: K⁺ ions just swap places, so the voltage stays at 0 mV.',
    ],
    correct: 0,
    explain:
      'Each K⁺ that leaves takes a positive charge out and leaves a negative protein behind, so the inside turns negative. That negativity pulls K⁺ back in. When the pull matches the push, the flow balances and the voltage levels off, long before the concentrations change.',
  };
}

interface Flight {
  dir: Crossing;
  ch: number;
  p: number;
  jitter: number;
}

export class RestingPotentialElement extends SimElement {
  private model = new TugModel();
  private speed = 1;
  private history: { t: number; V: number }[] = [];
  private flights: Flight[] = [];
  private rand = rng(11);
  private clock = 0;
  private pinnedCaption: string | null = null;
  private lastReadout = 0;
  private settledSaid = false;
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
        @container (min-width: 760px) {
          canvas.membrane { aspect-ratio: 16 / 15 !important; }
        }
        .ion-pick { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.5rem; }
        .open { margin-top: 0.75rem; }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Ion tug-of-war<small>One kind of ion, one kind of channel · concentrations held steady</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Play"><span aria-hidden="true">▶</span> <span class="lbl">Play</span></button>
            <button class="step" type="button" aria-label="Step forward a tenth of a second" title="Step">⏭</button>
            <button class="reset" type="button" aria-label="Reset" title="Reset">↺</button>
            <label class="visually-hidden" for="speed">Speed</label>
            <select id="speed" class="speed" aria-label="Speed">
              ${SPEEDS.map((s) => `<option value="${s}">${s}× speed</option>`).join('')}
            </select>
          </div>
        </div>
        <p class="caption" aria-live="off"></p>
        <div class="views two">
          <figure>
            <canvas class="membrane" style="aspect-ratio: 4 / 3.3" role="img" aria-label="A membrane with ion channels. Ions cross and their charge builds up in a thin layer on each face."></canvas>
            <figcaption>
              <span class="legend">
                <span class="lg-ion"></span>
                <span><i style="background: var(--text-faint); border-radius: 40%"></i>A⁻: proteins too big to cross</span>
                <span><i class="line lg-push"></i>Push: the concentration gradient</span>
                <span><i class="line" style="background: var(--text)"></i>Pull: the voltage</span>
              </span>
            </figcaption>
          </figure>
          <figure>
            <canvas class="trace" style="aspect-ratio: 16 / 12" role="img" aria-label="Voltage inside the cell over time, and how many ions cross each way per second"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="line" style="background: var(--trace)"></i>Voltage inside</span>
                <span><i class="line lg-e"></i>Nernst potential</span>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="readouts" role="group" aria-label="Readouts">
          <span><b>Voltage</b><span class="r-v"></span></span>
          <span><b>Nernst</b><span class="r-e"></span></span>
          <span><b>Net crossings</b><span class="r-net"></span></span>
          <span><b>In a real cell</b><span class="r-real"></span></span>
        </div>
        <div class="controls">
          <fieldset>
            <legend>The ion</legend>
            <div class="ion-pick" role="group" aria-label="Which ion can cross">
              ${ION_ORDER.map((id) => `<button type="button" class="pick pick-${id}" data-ion="${id}" aria-pressed="false">${IONS[id].symbol} ${IONS[id].name.toLowerCase()}</button>`).join('')}
            </div>
            <button type="button" class="open primary">Open the channels</button>
          </fieldset>
          <fieldset>
            <legend>Concentrations</legend>
            <div class="slider">
              <label for="cin">Inside the cell</label>
              <input id="cin" class="cin" type="range" min="0" max="100" step="0.5" />
              <output for="cin" class="o-cin"></output>
            </div>
            <div class="slider">
              <label for="cout">Outside the cell</label>
              <input id="cout" class="cout" type="range" min="0" max="100" step="0.5" />
              <output for="cout" class="o-cout"></output>
            </div>
            <div class="slider">
              <label for="temp">Temperature</label>
              <input id="temp" class="temp" type="range" min="0" max="45" step="1" />
              <output for="temp" class="o-temp"></output>
            </div>
          </fieldset>
          <fieldset>
            <legend>Options</legend>
            <label class="toggle"><input type="checkbox" class="sound" /><span>Sound<small>A click for every ion that crosses</small></span></label>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Ask before the channels open</small></span></label>
            <div class="row">
              <button class="png" type="button">Save PNG</button>
              <button class="link" type="button">Copy link</button>
            </div>
            <p class="keys">Keys: <kbd>Space</kbd> play or pause · <kbd>O</kbd> open or close channels · <kbd>S</kbd> step · <kbd>R</kbd> reset</p>
          </fieldset>
        </div>
      </div>`);
    this.membrane = this.$('.membrane') as HTMLCanvasElement;
    this.trace = this.$('.trace') as HTMLCanvasElement;

    this.applyPreset(this.getAttribute('preset') ?? 'potassium', false);
    const ion = this.getAttribute('ion');
    if (ion === 'k' || ion === 'na' || ion === 'cl') this.setIon(ion, false);
    const num = (name: string) => {
      const v = this.getAttribute(name);
      return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    const cin = num('cin');
    if (cin !== null) this.model.cIn = Math.min(CMAX, Math.max(CMIN, cin));
    const cout = num('cout');
    if (cout !== null) this.model.cOut = Math.min(CMAX, Math.max(CMIN, cout));
    const temp = num('temp');
    if (temp !== null) this.model.tempC = Math.min(45, Math.max(0, temp));
    this.syncControls();
    this.wire();
  }

  /** Apply a named preset, e.g. from a "Try this" button. */
  applyPreset(name: string, start = true): void {
    const p = TUG_PRESETS[name] ?? TUG_PRESETS.potassium;
    const info = IONS[p.ion];
    this.model = new TugModel({ ion: p.ion, cIn: p.cIn ?? info.cIn, cOut: p.cOut ?? info.cOut, tempC: p.tempC ?? 37 });
    this.model.open = !!p.open;
    this.pinnedCaption = p.caption ?? null;
    this.history = [];
    this.flights = [];
    this.settledSaid = false;
    this.record();
    if (!this.membrane) return;
    this.syncControls();
    this.setCaption(this.captionText());
    if (start) this.play();
    else this.render();
  }

  private setIon(ion: IonId, keepConcs: boolean): void {
    const info = IONS[ion];
    const m = new TugModel({
      ion,
      cIn: keepConcs ? this.model.cIn : info.cIn,
      cOut: keepConcs ? this.model.cOut : info.cOut,
      tempC: this.model.tempC,
    });
    this.model = m;
    this.history = [];
    this.flights = [];
    this.settledSaid = false;
    this.record();
  }

  private syncControls(): void {
    const m = this.model;
    this.root.querySelectorAll<HTMLButtonElement>('.pick').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ion === m.ion)));
    (this.$('.cin') as HTMLInputElement).value = String(toSlider(m.cIn));
    (this.$('.cout') as HTMLInputElement).value = String(toSlider(m.cOut));
    (this.$('.temp') as HTMLInputElement).value = String(m.tempC);
    (this.$('.sound') as HTMLInputElement).checked = soundOn();
    (this.$('.predict') as HTMLInputElement).checked = this.predictEnabled;
    (this.$('.speed') as HTMLSelectElement).value = String(this.speed);
    const info = IONS[m.ion];
    this.$('.lg-ion').innerHTML = `<i class="${info.shape === 'na' ? 'round' : ''}" style="background: var(${info.cssVar})${info.shape === 'cl' ? '; clip-path: polygon(50% 0, 100% 100%, 0 100%)' : ''}"></i>${info.symbol} (${info.shape === 'na' ? 'circles' : info.shape === 'k' ? 'squares' : 'triangles'})`;
    (this.$('.lg-e') as HTMLElement).style.background = `var(${info.cssVar})`;
    (this.$('.lg-push') as HTMLElement).style.background = `var(${info.cssVar})`;
    this.updateOutputs();
  }

  private updateOutputs(): void {
    const m = this.model;
    const conc = (c: number) => `${c < 10 ? c.toFixed(1) : Math.round(c)} mM`;
    this.$('.o-cin').textContent = conc(m.cIn);
    this.$('.o-cout').textContent = conc(m.cOut);
    this.$('.o-temp').textContent = `${Math.round(m.tempC)} °C`;
    const b = this.$('.open');
    b.textContent = m.open ? 'Close the channels' : `Open the ${IONS[m.ion].symbol} channels`;
    b.classList.toggle('primary', !m.open);
  }

  private wire(): void {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => {
      unlockAudio();
      if (!this.playing && !this.model.open) void this.openChannels();
      else this.toggle();
    });
    on('.step', 'click', () => this.stepOnce());
    on('.reset', 'click', () => this.reset());
    on('.speed', 'change', (e) => {
      this.speed = Number((e.target as HTMLSelectElement).value);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.pick').forEach((b) =>
      b.addEventListener('click', () => {
        const ion = b.dataset.ion as IonId;
        this.pinnedCaption = null;
        this.setIon(ion, false);
        this.syncControls();
        this.setCaption(this.captionText());
        this.announce(`${IONS[ion].name} selected. Channels closed. Nernst potential ${sfmt(this.model.nernst(), 0)} millivolts.`, true);
        this.render();
      }),
    );
    on('.open', 'click', () => {
      unlockAudio();
      if (this.model.open) {
        this.model.open = false;
        this.pinnedCaption = null;
        this.updateOutputs();
        this.setCaption('Channels closed. No ion can cross now, so the charge stays where it is and so does the voltage.');
        this.announce('Channels closed.', true);
      } else void this.openChannels();
    });
    const conc = (sel: string, key: 'cIn' | 'cOut') =>
      on(sel, 'input', (e) => {
        this.model[key] = fromSlider(Number((e.target as HTMLInputElement).value));
        this.pinnedCaption = null;
        this.settledSaid = false;
        this.updateOutputs();
        this.render();
      });
    conc('.cin', 'cIn');
    conc('.cout', 'cOut');
    on('.temp', 'input', (e) => {
      this.model.tempC = Number((e.target as HTMLInputElement).value);
      this.pinnedCaption = null;
      this.settledSaid = false;
      this.updateOutputs();
      this.render();
    });
    on('.sound', 'change', (e) => {
      const v = (e.target as HTMLInputElement).checked;
      if (v) unlockAudio();
      setSetting('sound', v);
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.png', 'click', () => this.savePng([this.membrane, this.trace], 'Ion tug-of-war', 'ion-tug-of-war.png'));
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'SELECT' || (tag === 'INPUT' && (target as HTMLInputElement).type === 'range')) return;
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'o' || e.key === 'O') {
        (this.$('.open') as HTMLButtonElement).click();
      } else if (e.key === 's' || e.key === 'S') {
        this.stepOnce();
      } else if (e.key === 'r' || e.key === 'R') {
        this.reset();
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

  private async openChannels(): Promise<void> {
    if (this.predictEnabled && Math.abs(this.model.V()) < 1) await this.ask(openQuestion(this.model.ion));
    this.model.open = true;
    this.pinnedCaption = null;
    this.updateOutputs();
    this.announce(`${IONS[this.model.ion].symbol} channels open.`, true);
    this.setCaption(this.captionText());
    this.play();
  }

  reset(): void {
    this.pause();
    this.model.reset();
    this.model.open = false;
    this.history = [];
    this.flights = [];
    this.settledSaid = false;
    this.pinnedCaption = null;
    this.record();
    this.updateOutputs();
    this.setCaption(this.captionText());
    this.render();
  }

  stepOnce(): void {
    this.pause();
    if (!this.model.open) {
      this.model.open = true;
      this.updateOutputs();
    }
    this.advance(0.1, 0.1);
    this.render();
  }

  protected tick(dtReal: number): void {
    this.clock += dtReal;
    this.advance(dtReal * this.speed, dtReal);
  }

  private advance(dt: number, dtReal: number): void {
    const events = this.model.step(dt, this.rand);
    for (const dir of events) {
      if (!this.reducedMotion) this.flights.push({ dir, ch: Math.floor(this.rand() * 3), p: 0, jitter: this.rand() - 0.5 });
      if (soundOn()) click(dir === 'out' ? 1.2 : 0.8, 0.2);
    }
    for (const f of this.flights) f.p += dtReal / 0.6;
    this.flights = this.flights.filter((f) => f.p < 1);
    this.record();
    const m = this.model;
    if (m.open && !this.settledSaid && Math.abs(m.Vmean() - m.nernst()) < 2 && Math.abs(m.nernst()) > 3) {
      this.settledSaid = true;
      this.announce(`Balanced: the voltage has settled near ${sfmt(m.nernst(), 0)} millivolts, the Nernst potential. Ions still cross, but equally often both ways.`, true);
    }
  }

  private record(): void {
    this.history.push({ t: this.model.t, V: this.model.V() });
    const cutoff = this.model.t - WINDOW - 1;
    let drop = 0;
    while (drop < this.history.length && this.history[drop].t < cutoff) drop++;
    if (drop) this.history.splice(0, drop);
  }

  // ---------- Words ----------

  private captionText(): string {
    if (this.pinnedCaption) return this.pinnedCaption;
    const m = this.model;
    const info = IONS[m.ion];
    const E = m.nernst();
    if (!m.open) {
      return Math.abs(m.V()) < 1
        ? `The ${info.name.toLowerCase()} channels are closed. Both sides are electrically neutral, so the voltage is 0 mV. Press Play to open them.`
        : 'Channels closed. No ion can cross now, so the charge stays where it is and so does the voltage.';
    }
    if (Math.abs(m.cIn - m.cOut) / Math.max(m.cIn, m.cOut) < 0.02) return 'The same concentration on both sides: ions cross equally often both ways, so no charge builds up.';
    const near = Math.abs(m.V() - E) <= MV_PER_ION * 1.5;
    if (near) return `Balanced at about ${sfmt(E, 0)} mV: the electrical pull now matches the concentration push. Ions still cross, but as many go one way as the other.`;
    const r = m.rates();
    const outward = r.out > r.in;
    const where = outward ? 'out of' : 'into';
    const sign = info.z > 0 ? 'positive' : 'negative';
    return `More ${info.symbol} crosses ${where} the cell than back, carrying ${sign} charge. The voltage keeps changing until it reaches ${sfmt(E, 0)} mV.`;
  }

  private setCaption(text: string): void {
    const el = this.root.querySelector('.caption');
    if (el && el.textContent !== text) el.textContent = text;
  }

  private updateReadouts(): void {
    const m = this.model;
    const V = m.V();
    this.$('.r-v').textContent = `${sfmt(V, 0)} mV`;
    this.$('.r-e').textContent = `${sfmt(m.nernst(), 1)} mV`;
    const net = m.crossed;
    this.$('.r-net').textContent = net === 0 ? '0' : `${Math.abs(net)} ${IONS[m.ion].symbol} ${net > 0 ? 'out' : 'in'}`;
    const real = ionsToCharge(V);
    const frac = real / ionsInside(m.ion === 'k' ? m.cIn : m.cOut);
    this.$('.r-real').textContent =
      real < 1e5 ? '—' : `≈ ${(real / 1e6).toFixed(1)} million ions, ${(frac * 100).toFixed(4)}% of the ${IONS[m.ion].symbol} on the crowded side`;
    this.setCaption(this.captionText());
  }

  private async copyLink(): Promise<void> {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    const m = this.model;
    u.searchParams.set('ion', m.ion);
    u.searchParams.set('cin', String(m.cIn));
    u.searchParams.set('cout', String(m.cOut));
    if (m.tempC !== 37) u.searchParams.set('temp', String(m.tempC));
    const btn = this.$('.link');
    try {
      await navigator.clipboard.writeText(u.toString());
      btn.textContent = 'Link copied';
    } catch {
      prompt('Copy this link:', u.toString());
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
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
      accent: '--accent',
      membrane: '--membrane',
      membraneEdge: '--membrane-edge',
      trace: '--trace',
      grid: '--grid',
      k: '--ion-k',
      na: '--ion-na',
      cl: '--ion-cl',
      mono: '--font-mono',
    });
  }

  protected render(): void {
    if (!this.membrane) return;
    const pal = this.palette();
    this.drawMembrane(pal);
    this.drawTrace(pal);
    const now = performance.now();
    if (now - this.lastReadout > 120 || !this.playing) {
      this.lastReadout = now;
      this.updateReadouts();
    }
  }

  private drawMembrane(pal: ReturnType<RestingPotentialElement['palette']>): void {
    const { w: W, h: H } = fitCanvas(this.membrane);
    const ctx = this.membrane.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const m = this.model;
    const info = IONS[m.ion];
    const color = pal[m.ion];
    const scale = this.hasAttribute('present') ? 1.25 : 1;
    const mono = `${Math.round(11 * scale)}px ${pal.mono || 'monospace'}`;
    const memTop = H * 0.45;
    const memBot = H * 0.58;
    const thick = memBot - memTop;
    const r = Math.max(3.4, Math.min(6, W / 85));
    const arrowsW = Math.min(150, W * 0.3);
    const fieldW = W - arrowsW;

    // Region labels with concentrations
    ctx.font = mono;
    ctx.fillStyle = pal.faint;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`OUTSIDE · ${info.symbol} ${m.cOut < 10 ? m.cOut.toFixed(1) : Math.round(m.cOut)} mM`, 10, 8);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`INSIDE · ${info.symbol} ${m.cIn < 10 ? m.cIn.toFixed(1) : Math.round(m.cIn)} mM`, 10, H - 8);

    // Bulk ions: count shows concentration; they jiggle but never change in number
    const rand = rng(5);
    const wiggle = this.reducedMotion ? 0 : 1;
    const cloud = (n: number, y0: number, y1: number, alpha: number) => {
      for (let i = 0; i < n; i++) {
        const x = 14 + rand() * (fieldW - 28);
        const y = y0 + rand() * (y1 - y0);
        const ph = rand() * 6.28;
        const speed = 0.8 + (m.tempC / 37) * 0.9;
        const dx = wiggle * Math.sin(this.clock * 1.9 * speed + ph) * 2.5;
        const dy = wiggle * Math.cos(this.clock * 1.4 * speed + ph * 1.3) * 2.5;
        drawIon(ctx, info.shape, x + dx, y + dy, r, withAlpha(color, alpha));
      }
    };
    const count = (c: number) => Math.max(c > 0.5 ? 1 : 0, Math.min(36, Math.round(c / 5)));
    cloud(count(m.cOut), 30, memTop - 34, 0.7);
    // Big impermeant anions inside
    const aRand = rng(9);
    ctx.fillStyle = withAlpha(pal.faint, 0.35);
    for (let i = 0; i < 6; i++) {
      const x = 30 + aRand() * (fieldW - 60);
      const y = memBot + 40 + aRand() * (H - memBot - 80);
      roundRect(ctx, x - r * 2.2, y - r * 1.5, r * 4.4, r * 3, r * 1.2);
      ctx.fill();
    }
    ctx.fillStyle = withAlpha(pal.text, 0.6);
    ctx.font = `${Math.round(9.5 * scale)}px ${pal.mono || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const aRand2 = rng(9);
    for (let i = 0; i < 6; i++) {
      const x = 30 + aRand2() * (fieldW - 60);
      const y = memBot + 40 + aRand2() * (H - memBot - 80);
      ctx.fillText('A⁻', x, y);
    }
    cloud(count(m.cIn), memBot + 30, H - 30, 0.7);

    // Lipid bilayer
    ctx.fillStyle = withAlpha(pal.membrane, 0.22);
    ctx.fillRect(0, memTop, fieldW, thick);
    const headR = Math.max(2.5, thick * 0.11);
    ctx.fillStyle = withAlpha(pal.membrane, 0.85);
    for (let x = headR; x < fieldW; x += headR * 2.3) {
      ctx.beginPath();
      ctx.arc(x, memTop + headR, headR, 0, Math.PI * 2);
      ctx.arc(x, memBot - headR, headR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Channels
    const nCh = 3;
    const cw = Math.min(42, fieldW / 9);
    const chX = Array.from({ length: nCh }, (_, i) => ((i + 0.5) / nCh) * fieldW);
    for (const cx of chX) {
      const pore = cw * 0.34;
      const halfW = (cw - pore) / 2;
      ctx.lineWidth = 2;
      ctx.strokeStyle = color;
      ctx.fillStyle = pal.surface3;
      for (const x of [cx - cw / 2, cx + pore / 2]) {
        roundRect(ctx, x, memTop - 6, halfW, thick + 12, 5);
        ctx.fill();
        ctx.stroke();
      }
      if (!m.open) {
        ctx.strokeStyle = pal.text;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - pore / 2, memTop + thick / 2);
        ctx.lineTo(cx + pore / 2, memTop + thick / 2);
        ctx.stroke();
      }
    }

    // Separated charge: crossed ions line the face they reached; their partners line the other face
    const net = m.crossed;
    const shown = Math.min(40, Math.abs(net));
    if (shown > 0) {
      const movedOut = net > 0;
      const ionY = movedOut ? memTop - r - 3 : memBot + r + 3;
      const partnerY = movedOut ? memBot + r + 4 : memTop - r - 4;
      const partnerSign = info.z > 0 ? '−' : '+';
      ctx.font = `700 ${Math.round(12 * scale)}px ${pal.mono || 'monospace'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < shown; i++) {
        const x = ((i + 0.5) / shown) * fieldW;
        drawIon(ctx, info.shape, x, ionY, r * 0.85, color);
        ctx.fillStyle = withAlpha(pal.text, 0.8);
        ctx.fillText(partnerSign, x, partnerY);
      }
    }

    // Ions in flight through the channels
    for (const f of this.flights) {
      const cx = chX[f.ch];
      const from = f.dir === 'out' ? memBot + 34 : memTop - 34;
      const to = f.dir === 'out' ? memTop - 34 : memBot + 34;
      const y = from + (to - from) * f.p;
      const inPore = y > memTop - 8 && y < memBot + 8;
      const x = cx + (inPore ? 0 : f.jitter * cw);
      const a = f.p < 0.15 ? f.p / 0.15 : f.p > 0.85 ? (1 - f.p) / 0.15 : 1;
      drawIon(ctx, info.shape, x, y, r * 1.1, withAlpha(color, a));
    }

    // Force arrows: concentration push and electrical pull, both in mV
    const fc = forces(info.z, m.cIn, m.cOut, m.V(), m.tempC);
    const ax = fieldW + arrowsW * 0.32;
    const bx = fieldW + arrowsW * 0.72;
    const mid = (memTop + memBot) / 2;
    const maxLen = Math.min(H * 0.36, 150);
    const len = (mv: number) => Math.min(maxLen, (Math.abs(mv) / 110) * maxLen);
    ctx.fillStyle = withAlpha(pal.surface2, 0.9);
    roundRect(ctx, fieldW + 4, 4, arrowsW - 8, H - 8, 10);
    ctx.fill();
    this.arrow(ctx, ax, mid, -Math.sign(fc.concentration) * len(fc.concentration), color, 9);
    this.arrow(ctx, bx, mid, -Math.sign(fc.electrical) * len(fc.electrical), pal.text, 9);
    const narrow = arrowsW < 125;
    ctx.font = `700 ${Math.round((narrow ? 9 : 10.5) * scale)}px ${pal.mono || 'monospace'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    const lbl = (text: string, x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      text.split('\n').forEach((line, i) => ctx.fillText(line, x, y + i * 13 * scale));
    };
    lbl(narrow ? 'push' : 'crowd\npush', ax, 12, color);
    lbl(narrow ? 'pull' : 'charge\npull', bx, 12, pal.text);
    ctx.textBaseline = 'bottom';
    ctx.font = `${Math.round(10.5 * scale)}px ${pal.mono || 'monospace'}`;
    lbl(`${Math.round(Math.abs(fc.concentration))}`, ax, H - 22, color);
    lbl(`${Math.round(Math.abs(fc.electrical))}`, bx, H - 22, pal.text);
    ctx.fillStyle = pal.faint;
    ctx.fillText('mV', (ax + bx) / 2, H - 9);

    // Voltmeter, on a soft panel so drifting ions never hide it
    ctx.fillStyle = withAlpha(pal.surface, 0.85);
    roundRect(ctx, fieldW - 10 - 128 * scale, 4, 128 * scale + 6, 40 * scale, 8);
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(15 * scale)}px ${pal.mono || 'monospace'}`;
    ctx.fillStyle = pal.text;
    ctx.fillText(`${sfmt(m.V(), 0)} mV`, fieldW - 10, 8);
    ctx.font = mono;
    ctx.fillStyle = pal.faint;
    ctx.fillText('inside vs outside', fieldW - 10, 8 + 18 * scale);
  }

  /** A vertical arrow from (x, y) with signed length (negative = up). */
  private arrow(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, color: string, width: number): void {
    if (Math.abs(length) < 4) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const dir = Math.sign(length);
    const head = Math.min(14, Math.abs(length) * 0.6);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + length - dir * head);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - width, y + length - dir * head);
    ctx.lineTo(x + width, y + length - dir * head);
    ctx.lineTo(x, y + length);
    ctx.closePath();
    ctx.fill();
  }

  private drawTrace(pal: ReturnType<RestingPotentialElement['palette']>): void {
    const { w: W, h: H } = fitCanvas(this.trace);
    const ctx = this.trace.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const m = this.model;
    const info = IONS[m.ion];
    const color = pal[m.ion];
    const scale = this.hasAttribute('present') ? 1.25 : 1;
    const small = `${Math.round(10.5 * scale)}px ${pal.mono || 'monospace'}`;
    const L = 46 * scale;
    const R = 12;
    const T = 14;
    const flowH = Math.max(54, H * 0.2);
    const B = 24 * scale + flowH + 14;
    const x0 = L;
    const x1 = W - R;
    const y0 = T;
    const y1 = H - B;
    const vMin = -110;
    const vMax = 90;
    const Y = (v: number) => y0 + (1 - (Math.min(vMax, Math.max(vMin, v)) - vMin) / (vMax - vMin)) * (y1 - y0);
    const tNow = m.t;
    const tMin = Math.max(0, tNow - WINDOW);
    const span = Math.max(WINDOW, tNow - tMin);
    const X = (t: number) => x0 + ((t - tMin) / span) * (x1 - x0);

    ctx.font = small;
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of [-100, -50, 0, 50]) {
      ctx.strokeStyle = v === 0 ? pal.muted : pal.grid;
      ctx.beginPath();
      ctx.moveTo(x0, Y(v));
      ctx.lineTo(x1, Y(v));
      ctx.stroke();
      ctx.fillStyle = pal.muted;
      ctx.fillText(v > 0 ? `+${v}` : fmt(v, 0), x0 - 6, Y(v));
    }
    ctx.save();
    ctx.translate(12, (y0 + y1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('mV inside', 0, 0);
    ctx.restore();

    // Nernst line
    const E = m.nernst();
    ctx.strokeStyle = withAlpha(color, 0.9);
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, Y(E));
    ctx.lineTo(x1, Y(E));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.textAlign = 'right';
    const above = E > -80;
    ctx.textBaseline = above ? 'bottom' : 'top';
    const sub = info.symbol.replace(/[⁺⁻]/g, '');
    ctx.fillText(`E_${sub} ${sfmt(E, 0)} mV (Nernst)`, x1 - 2, Y(E) + (above ? -3 : 3));

    // Voltage history
    ctx.strokeStyle = pal.trace;
    ctx.lineWidth = 2.25;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.history.forEach((s, i) => {
      if (s.t < tMin) return;
      i ? ctx.lineTo(X(s.t), Y(s.V)) : ctx.moveTo(X(s.t), Y(s.V));
    });
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(X(tNow), Y(m.V()), 4, 0, Math.PI * 2);
    ctx.fill();

    // Time axis
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stepS = W < 420 ? 20 : 10;
    for (let t = Math.ceil(tMin / stepS) * stepS; t <= tMin + span + 1e-6; t += stepS) {
      const x = X(t);
      const edge = x > x1 - 18;
      if (x < x0 + 10 && t > 0) continue;
      ctx.textAlign = edge ? 'right' : 'center';
      ctx.fillText(`${Math.round(t)} s`, edge ? x1 : x, y1 + 6);
    }

    // Crossings per second, each way
    const fy = H - flowH - 6;
    const r = m.rates();
    const maxR = 7;
    const bx = x0 + (x1 - x0) * 0.3;
    const bw = Math.max(40, x1 - bx - 40);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = pal.faint;
    ctx.fillText('CROSSINGS PER SECOND', 8, fy - 2);
    const bar = (label: string, rate: number, yy: number) => {
      ctx.fillStyle = pal.muted;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(label, 8, yy);
      ctx.fillStyle = withAlpha(pal.surface3, 0.9);
      roundRect(ctx, bx, yy - 7, bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = color;
      roundRect(ctx, bx, yy - 7, Math.max(0, Math.min(1, rate / maxR)) * bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'right';
      ctx.fillText(rate.toFixed(1), x1, yy);
    };
    bar(`${info.symbol} out`, r.out, fy + 22);
    bar(`${info.symbol} in`, r.in, fy + 44);
  }
}

if (!customElements.get('nc-resting-potential')) customElements.define('nc-resting-potential', RestingPotentialElement);
