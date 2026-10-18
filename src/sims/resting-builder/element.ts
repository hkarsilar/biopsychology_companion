import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { drawIon, fitCanvas, readPalette, roundRect, withAlpha } from '../shared/canvas';
import { IONS, ION_ORDER, nernst, type IonId } from '../resting-potential/ions';
import { evolve, ghk, ghkFlux, PRESETS, pToSlider, pulls, sliderToP, type Concs, type Perms } from './model';

/**
 * <nc-resting-builder>: build a resting potential from three leaky ions (GHK).
 * Each ion is a team in a tug-of-war, pulling the voltage towards its own Nernst potential.
 * How hard it pulls depends on how leaky the membrane is to it. The pump keeps the gradients;
 * switch it off and a time-lapse shows them run down over hours.
 *
 * Attributes: preset, pk, pna, pcl, kout, temp, pump ("off" to start with it off),
 * predict, present, lab-href.
 */

const SPEEDS = [0.5, 1, 2, 4]; // simulated hours per second
const MAX_HOURS = 24;
const CONC_MIN = 0.1;
const CONC_MAX = 1000;

/** Like fmt, with a plus sign on positive values. */
const sfmt = (x: number, d: number): string => (Number(x.toFixed(d)) > 0 ? '+' : '') + fmt(x, d);
const pText = (P: number): string => (P <= 0 ? 'none' : String(Number(P.toPrecision(2))));
const cText = (c: number): string => (c < 10 ? String(Math.round(c * 10) / 10) : String(Math.round(c)));
const clone = (C: Concs): Concs => ({ k: { ...C.k }, na: { ...C.na }, cl: { ...C.cl } });

const PUMP_QUESTION: PredictQuestion = {
  id: 'pump-off',
  question: 'The Na⁺/K⁺ pump is about to stop. What happens to the resting potential?',
  options: [
    'It drops to 0 mV straight away.',
    'It changes by only a few mV at first, then drifts towards 0 over hours.',
    'Nothing, ever: the pump has nothing to do with the resting potential.',
  ],
  correct: 1,
  explain:
    'The pump’s own current is worth only a few mV. Its big job is slower: it keeps the concentration gradients. Without it, K⁺ leaks out and Na⁺ leaks in, and the voltage runs down over hours.',
};

const HYPERK_QUESTION: PredictQuestion = {
  id: 'hyperkalaemia',
  question: 'Potassium outside the cell rises from 5 to 12 mM, as in kidney failure. What happens to the resting potential?',
  options: ['It becomes more negative.', 'It becomes less negative (depolarised).', 'Nothing: only the K⁺ inside matters.'],
  correct: 1,
  explain: 'With more K⁺ outside, the push driving K⁺ out is weaker, so E_K and the resting potential both move up towards 0. That is why high blood potassium is dangerous for the heart.',
};

export class RestingBuilderElement extends SimElement {
  private P: Perms = { ...PRESETS.neuron.P };
  private C: Concs = clone(PRESETS.neuron.C);
  /** The concentrations the pump maintains. */
  private rest: Concs = clone(PRESETS.neuron.C);
  private tempC = 37;
  private pump = true;
  private hours = 0;
  private speed = 1;
  private presetName: string | null = 'neuron';
  private pinned: string | null = null;
  private tug!: HTMLCanvasElement;
  private grad!: HTMLCanvasElement;
  private lastReadout = 0;

  static get observedAttributes() {
    return ['present'];
  }

  attributeChangedCallback() {
    this.render();
  }

  protected build(): void {
    this.html(`
      <style>
        canvas.tug { aspect-ratio: 4 / 3.6; }
        canvas.grad { aspect-ratio: 4 / 3.4; }
        @container (min-width: 760px) {
          .sim .views.two { grid-template-columns: 1.25fr 1fr; }
          canvas.tug { aspect-ratio: 16 / 10; }
          canvas.grad { aspect-ratio: 4 / 3.125; }
        }
        .presets { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; }
        .presets button { font-size: 0.88em; }
        table.concs { width: 100%; border-collapse: collapse; margin-top: 0.4rem; font-size: 0.9em; }
        table.concs th { font-weight: 600; color: var(--text-muted); text-align: left; padding: 0.2rem 0.3rem; }
        table.concs td { padding: 0.2rem 0.3rem; }
        table.concs input { width: 100%; min-width: 4.5rem; font-family: var(--font-mono, monospace); text-align: right; }
        .pump-row { margin-top: 0.4rem; }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Resting potential builder<small>Three leaky ions at once · Goldman–Hodgkin–Katz</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Run the clock"><span aria-hidden="true">▶</span> <span class="lbl">Run the clock</span></button>
            <button class="step" type="button" aria-label="Step forward half an hour" title="Step">⏭</button>
            <button class="reset" type="button" aria-label="Reset" title="Reset">↺</button>
            <label class="visually-hidden" for="speed">Time-lapse speed</label>
            <select id="speed" class="speed" aria-label="Time-lapse speed">
              ${SPEEDS.map((s) => `<option value="${s}">${s} h per second</option>`).join('')}
            </select>
          </div>
        </div>
        <p class="caption" aria-live="off"></p>
        <div class="views two">
          <figure>
            <canvas class="tug" role="img" aria-label="A tug-of-war on the voltage. Each ion pulls towards its own Nernst potential, with a rope as thick as its share of the pull."></canvas>
            <figcaption>
              <span class="legend">
                <span><i style="background: var(--ion-k)"></i>K⁺</span>
                <span><i class="round" style="background: var(--ion-na)"></i>Na⁺</span>
                <span><i style="background: var(--ion-cl); clip-path: polygon(50% 0, 100% 100%, 0 100%)"></i>Cl⁻</span>
                <span>Rope thickness = share of the pull</span>
              </span>
            </figcaption>
          </figure>
          <figure>
            <canvas class="grad" role="img" aria-label="Concentrations of each ion inside and outside the cell, with arrows for the leak across the membrane"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="line" style="background: var(--text-muted)"></i>Net leak across the membrane</span>
                <span><i class="line" style="background: var(--text-faint)"></i>Where the pump holds it</span>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="readouts" role="group" aria-label="Readouts">
          <span><b>Resting potential</b><span class="r-v"></span></span>
          <span><b>Pump’s own share</b><span class="r-pump"></span></span>
          <span><b>E_K</b><span class="r-ek"></span></span>
          <span><b>E_Na</b><span class="r-ena"></span></span>
          <span><b>E_Cl</b><span class="r-ecl"></span></span>
          <span><b>Clock</b><span class="r-clock"></span></span>
        </div>
        <div class="controls">
          <fieldset>
            <legend>Start from</legend>
            <div class="presets" role="group" aria-label="Example cells">
              ${Object.entries(PRESETS)
                .map(([id, p]) => `<button type="button" class="preset" data-preset="${id}" aria-pressed="false">${p.label}</button>`)
                .join('')}
            </div>
          </fieldset>
          <fieldset>
            <legend>How leaky is the membrane?</legend>
            ${ION_ORDER.map(
              (ion) => `
            <div class="slider">
              <label for="p-${ion}">${IONS[ion].symbol} permeability</label>
              <input id="p-${ion}" class="perm" data-ion="${ion}" type="range" min="0" max="100" step="0.5" />
              <output for="p-${ion}" class="o-p-${ion}"></output>
            </div>`,
            ).join('')}
            <p class="note">Relative to K⁺ at rest (1). Log scale: each step to the right multiplies the leak.</p>
          </fieldset>
          <fieldset>
            <legend>Concentrations (mM)</legend>
            <table class="concs">
              <thead><tr><th scope="col">Ion</th><th scope="col">Inside</th><th scope="col">Outside</th></tr></thead>
              <tbody>
                ${ION_ORDER.map(
                  (ion) => `<tr><th scope="row">${IONS[ion].symbol}</th>
                  <td><input class="conc" data-ion="${ion}" data-side="in" type="number" min="${CONC_MIN}" max="${CONC_MAX}" step="any" inputmode="decimal" aria-label="${IONS[ion].symbol} inside, millimolar" /></td>
                  <td><input class="conc" data-ion="${ion}" data-side="out" type="number" min="${CONC_MIN}" max="${CONC_MAX}" step="any" inputmode="decimal" aria-label="${IONS[ion].symbol} outside, millimolar" /></td></tr>`,
                ).join('')}
              </tbody>
            </table>
            <div class="slider">
              <label for="temp">Temperature</label>
              <input id="temp" class="temp" type="range" min="0" max="45" step="1" />
              <output for="temp" class="o-temp"></output>
            </div>
          </fieldset>
          <fieldset>
            <legend>Pump and options</legend>
            <label class="toggle pump-row"><input type="checkbox" class="pump" /><span>Na⁺/K⁺ pump running<small>3 Na⁺ out, 2 K⁺ in. Switch off to watch the gradients run down.</small></span></label>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Ask before some changes</small></span></label>
            <div class="row">
              <button class="png" type="button">Save PNG</button>
              <button class="link" type="button">Copy link</button>
            </div>
            <p class="keys">Keys: <kbd>Space</kbd> run or pause the clock · <kbd>P</kbd> pump on or off · <kbd>S</kbd> step · <kbd>R</kbd> reset</p>
          </fieldset>
        </div>
      </div>`);
    this.tug = this.$('.tug') as HTMLCanvasElement;
    this.grad = this.$('.grad') as HTMLCanvasElement;

    this.applyPreset(this.getAttribute('preset') ?? 'neuron');
    const num = (name: string) => {
      const v = this.getAttribute(name);
      return v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    };
    let custom = false;
    for (const [attr, ion] of [
      ['pk', 'k'],
      ['pna', 'na'],
      ['pcl', 'cl'],
    ] as const) {
      const v = num(attr);
      if (v !== null) {
        this.P[ion] = Math.min(sliderToP(100), Math.max(0, v));
        custom = true;
      }
    }
    const kout = num('kout');
    if (kout !== null) {
      this.C.k.out = this.rest.k.out = Math.min(CONC_MAX, Math.max(CONC_MIN, kout));
      custom = true;
    }
    const temp = num('temp');
    if (temp !== null) {
      this.tempC = Math.min(45, Math.max(0, temp));
      custom = true;
    }
    const pump = this.getAttribute('pump');
    if (pump !== null && /^(0|off|false|no)$/i.test(pump)) {
      this.pump = false;
      custom = true;
    }
    if (custom) {
      this.presetName = null;
      this.pinned = null;
    }
    this.syncControls();
    this.wire();
  }

  /** Apply a named preset, e.g. from a "Try this" button. */
  applyPreset(name: string): void {
    const key = PRESETS[name] ? name : 'neuron';
    const p = PRESETS[key];
    if (this.playing) this.pause();
    this.P = { ...p.P };
    this.C = clone(p.C);
    this.rest = clone(p.C);
    this.tempC = p.tempC;
    this.pump = p.pump;
    this.hours = 0;
    this.presetName = key;
    this.pinned = p.caption;
    if (!this.tug) return;
    this.syncControls();
    this.announceState(true);
    this.render();
    // Pump-off preset: start the time-lapse straight away, unless motion is reduced.
    if (!this.pump && !this.reducedMotion) this.play();
  }

  private syncControls(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === this.presetName)));
    this.root.querySelectorAll<HTMLInputElement>('.perm').forEach((el) => {
      el.value = String(pToSlider(this.P[el.dataset.ion as IonId]));
    });
    this.syncConcInputs();
    (this.$('.temp') as HTMLInputElement).value = String(this.tempC);
    (this.$('.pump') as HTMLInputElement).checked = this.pump;
    (this.$('.predict') as HTMLInputElement).checked = this.predictEnabled;
    (this.$('.speed') as HTMLSelectElement).value = String(this.speed);
    this.updateOutputs();
  }

  private syncConcInputs(): void {
    this.root.querySelectorAll<HTMLInputElement>('.conc').forEach((el) => {
      if (this.root.activeElement === el) return;
      const ion = el.dataset.ion as IonId;
      el.value = cText(this.C[ion][el.dataset.side as 'in' | 'out']);
    });
  }

  private updateOutputs(): void {
    for (const ion of ION_ORDER) this.$(`.o-p-${ion}`).textContent = pText(this.P[ion]);
    this.$('.o-temp').textContent = `${Math.round(this.tempC)} °C`;
  }

  private customised(): void {
    this.presetName = null;
    this.pinned = null;
    this.root.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  }

  private wire(): void {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => this.runClock());
    on('.step', 'click', () => this.stepOnce());
    on('.reset', 'click', () => this.reset());
    on('.speed', 'change', (e) => {
      this.speed = Number((e.target as HTMLSelectElement).value);
    });
    this.root.querySelectorAll<HTMLButtonElement>('.preset').forEach((b) =>
      b.addEventListener('click', async () => {
        const name = b.dataset.preset!;
        if (name === 'hyperkalaemia') await this.ask(HYPERK_QUESTION);
        if (name === 'pump-off') await this.ask(PUMP_QUESTION);
        this.applyPreset(name);
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('.perm').forEach((el) =>
      el.addEventListener('input', () => {
        this.P[el.dataset.ion as IonId] = sliderToP(Number(el.value));
        this.customised();
        this.updateOutputs();
        this.announceState();
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('.conc').forEach((el) => {
      el.addEventListener('input', () => {
        const v = Number(el.value);
        if (el.value === '' || !Number.isFinite(v) || v < CONC_MIN || v > CONC_MAX) {
          el.setAttribute('aria-invalid', 'true');
          return;
        }
        el.removeAttribute('aria-invalid');
        const ion = el.dataset.ion as IonId;
        const side = el.dataset.side as 'in' | 'out';
        this.C[ion][side] = v;
        this.rest[ion][side] = v;
        this.customised();
        this.announceState();
        this.render();
      });
      el.addEventListener('change', () => {
        el.removeAttribute('aria-invalid');
        this.syncConcInputs();
        el.value = cText(this.C[el.dataset.ion as IonId][el.dataset.side as 'in' | 'out']);
      });
    });
    on('.temp', 'input', (e) => {
      this.tempC = Number((e.target as HTMLInputElement).value);
      this.customised();
      this.updateOutputs();
      this.announceState();
      this.render();
    });
    on('.pump', 'change', (e) => {
      const box = e.target as HTMLInputElement;
      void this.setPump(box.checked);
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.png', 'click', () => this.savePng([this.tug, this.grad], 'Resting potential builder', 'resting-potential-builder.png'));
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'SELECT' || tag === 'INPUT') return;
      if (e.key === ' ' && tag !== 'BUTTON') {
        e.preventDefault();
        this.runClock();
      } else if (e.key === 'p' || e.key === 'P') {
        void this.setPump(!this.pump);
      } else if (e.key === 's' || e.key === 'S') {
        this.stepOnce();
      } else if (e.key === 'r' || e.key === 'R') {
        this.reset();
      }
    });
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
  }

  private async setPump(on: boolean): Promise<void> {
    const box = this.$('.pump') as HTMLInputElement;
    if (!on && this.pump) {
      box.checked = true;
      await this.ask(PUMP_QUESTION);
      box.checked = false;
      this.pump = false;
      this.hours = 0;
      this.customised();
      this.setCaption('Pump off. Watch the clock: at first the voltage hardly moves, then it slowly runs down as the gradients leak away.');
      this.announce('Pump off. The time-lapse clock is running.', true);
      if (!this.reducedMotion) this.play();
      else this.render();
      return;
    }
    if (on && !this.pump) {
      box.checked = true;
      this.pump = true;
      this.customised();
      if (this.drifted()) {
        this.setCaption('Pump back on. It moves Na⁺ out and K⁺ in, and wins back the gradients.');
        this.announce('Pump on. It is restoring the gradients.', true);
        if (!this.reducedMotion) this.play();
        else this.render();
      } else {
        this.announce('Pump on.', true);
        this.render();
      }
    }
  }

  /** Have the inside concentrations moved away from where the pump holds them? */
  private drifted(): boolean {
    return ION_ORDER.some((ion) => Math.abs(this.C[ion].in - this.rest[ion].in) / this.rest[ion].in > 0.003);
  }

  private runClock(): void {
    if (this.playing) {
      this.pause();
      return;
    }
    if (this.pump && !this.drifted()) {
      this.setCaption('With the pump running, the gradients hold steady, so nothing changes over time. Switch the pump off to watch them run down.');
      this.announce('Nothing changes while the pump runs. Switch it off first.', true);
      return;
    }
    this.play();
  }

  protected onPlayState(): void {
    const b = this.root.querySelector('.play');
    if (!b) return;
    const label = this.playing ? 'Pause the clock' : 'Run the clock';
    b.setAttribute('aria-label', label);
    b.querySelector('span[aria-hidden]')!.textContent = this.playing ? '❚❚' : '▶';
    b.querySelector('.lbl')!.textContent = this.playing ? 'Pause' : 'Run the clock';
  }

  reset(): void {
    this.pause();
    this.applyPreset(this.presetName ?? 'neuron');
    this.announce('Reset.', true);
  }

  stepOnce(): void {
    this.pause();
    this.advance(0.5);
    this.render();
  }

  protected tick(dtReal: number): void {
    this.advance(dtReal * this.speed);
  }

  private advance(hours: number): void {
    const before = this.drifted();
    this.C = evolve({ P: this.P, C: this.C, tempC: this.tempC, pump: this.pump }, this.rest, hours);
    this.hours += hours;
    if (!this.pump && this.hours >= MAX_HOURS) {
      this.pause();
      this.announce(`A day without the pump. The resting potential is now ${sfmt(this.V(), 0)} millivolts.`, true);
    }
    if (this.pump && before && !this.drifted()) {
      this.C = clone(this.rest);
      this.pause();
      this.setCaption('The pump has won back the gradients, and the resting potential is back where it started.');
      this.announce(`The pump has restored the gradients. Resting potential ${sfmt(this.V(), 0)} millivolts.`, true);
      this.pinned = 'The pump has won back the gradients, and the resting potential is back where it started.';
    }
    this.syncConcInputs();
  }

  // ---------- Physics shortcuts ----------

  private V(): number {
    return ghk(this.P, this.C, this.tempC, this.pump);
  }

  private Vleak(): number {
    return ghk(this.P, this.C, this.tempC, false);
  }

  private E(ion: IonId): number {
    return nernst(IONS[ion].z, this.C[ion].in, this.C[ion].out, this.tempC);
  }

  // ---------- Words ----------

  private captionText(): string {
    if (!this.pump && this.hours > 0.05) {
      return `Pump off for ${this.hours.toFixed(1)} h. K⁺ has leaked out and Na⁺ in, so E_K and E_Na creep towards 0 and the resting potential runs down with them.`;
    }
    if (this.pinned) return this.pinned;
    const V = this.V();
    if (!Number.isFinite(V)) return 'No ion can cross the membrane, so nothing sets a voltage. Give at least one ion a leak.';
    const sh = pulls(this.P, this.C, this.Vleak(), this.tempC).sort((a, b) => b.share - a.share);
    const top = sh[0];
    const sym = IONS[top.ion].symbol;
    if (top.share > 0.97) return `Only ${sym} leaks, so the voltage sits right on its Nernst potential, ${sfmt(top.E, 0)} mV.`;
    return `${sym} pulls hardest (${Math.round(top.share * 100)} %), so the voltage sits nearest E for ${sym}. The other ions pull it ${V > top.E ? 'up' : 'down'} a little, to ${sfmt(V, 0)} mV.`;
  }

  private setCaption(text: string): void {
    const el = this.root.querySelector('.caption');
    if (el && el.textContent !== text) el.textContent = text;
  }

  private announceState(force = false): void {
    const V = this.V();
    if (!Number.isFinite(V)) {
      this.announce('No ion can cross. No resting potential.', force);
      return;
    }
    const sh = pulls(this.P, this.C, this.Vleak(), this.tempC).sort((a, b) => b.share - a.share);
    this.announce(
      `Resting potential ${sfmt(V, 0)} millivolts. ${IONS[sh[0].ion].name} pulls hardest, ${Math.round(sh[0].share * 100)} percent.`,
      force,
      900,
    );
  }

  private updateReadouts(): void {
    const V = this.V();
    const ok = Number.isFinite(V);
    this.$('.r-v').textContent = ok ? `${sfmt(V, 1)} mV` : '—';
    this.$('.r-pump').textContent = this.pump && ok ? `${sfmt(V - this.Vleak(), 1)} mV` : 'off';
    this.$('.r-ek').textContent = `${sfmt(this.E('k'), 0)} mV`;
    this.$('.r-ena').textContent = `${sfmt(this.E('na'), 0)} mV`;
    this.$('.r-ecl').textContent = `${sfmt(this.E('cl'), 0)} mV`;
    this.$('.r-clock').textContent = this.hours > 0 ? `${this.hours.toFixed(1)} h` : this.pump ? 'steady' : '0 h';
    this.setCaption(this.captionText());
  }

  private async copyLink(): Promise<void> {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    if (this.presetName) u.searchParams.set('preset', this.presetName);
    else {
      u.searchParams.set('pk', String(Number(this.P.k.toPrecision(3))));
      u.searchParams.set('pna', String(Number(this.P.na.toPrecision(3))));
      u.searchParams.set('pcl', String(Number(this.P.cl.toPrecision(3))));
      u.searchParams.set('kout', cText(this.rest.k.out));
      if (this.tempC !== 37) u.searchParams.set('temp', String(this.tempC));
      if (!this.pump) u.searchParams.set('pump', 'off');
    }
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
      grid: '--grid',
      k: '--ion-k',
      na: '--ion-na',
      cl: '--ion-cl',
      mono: '--font-mono',
    });
  }

  protected render(): void {
    if (!this.tug) return;
    const pal = this.palette();
    this.drawTug(pal);
    this.drawGrad(pal);
    const now = performance.now();
    if (now - this.lastReadout > 150 || !this.playing) {
      this.lastReadout = now;
      this.updateReadouts();
    }
  }

  private drawTug(pal: ReturnType<RestingBuilderElement['palette']>): void {
    const { w: W, h: H } = fitCanvas(this.tug);
    const ctx = this.tug.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const s = this.hasAttribute('present') ? 1.25 : 1;
    const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${Math.round(px * s)}px ${pal.mono || 'monospace'}`;
    const narrow = W < 480;
    const L = (narrow ? 62 : 80) * s;
    const R = 18;
    const x0 = L;
    const x1 = W - R;
    const vMin = -100;
    const vMax = 80;
    const X = (v: number) => x0 + ((Math.min(vMax + 4, Math.max(vMin - 4, v)) - vMin) / (vMax - vMin)) * (x1 - x0);
    const axisY = H - 34 * s;
    const top = 50 * s;
    const laneH = (axisY - 14 - top) / 4;
    const laneY = (i: number) => top + laneH * (i + 0.5);

    // Axis
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, axisY);
    ctx.lineTo(x1, axisY);
    ctx.stroke();
    ctx.font = font(10.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const gridMv = narrow ? 25 : 20;
    const labelMv = narrow ? 50 : 20;
    for (let v = -100; v <= 80; v += gridMv) {
      const x = X(v);
      ctx.strokeStyle = v === 0 ? pal.muted : pal.grid;
      ctx.beginPath();
      ctx.moveTo(x, top - 8);
      ctx.lineTo(x, axisY + 4);
      ctx.stroke();
      if (v % labelMv === 0) {
        ctx.fillStyle = pal.muted;
        ctx.fillText(v > 0 ? `+${v}` : fmt(v, 0), x, axisY + 7);
      }
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.faint;
    ctx.fillText('mV', 8, axisY + 7);

    const V = this.V();
    const Vleak = this.Vleak();
    const ok = Number.isFinite(V);
    const shares = ok ? pulls(this.P, this.C, Vleak, this.tempC) : [];
    const xV = ok ? X(V) : 0;

    // One lane per ion: the team stands at its Nernst potential and pulls on the knot at V.
    ION_ORDER.forEach((ion, i) => {
      const y = laneY(i);
      const color = pal[ion];
      const info = IONS[ion];
      const E = this.E(ion);
      const xE = X(E);
      const share = shares.find((x) => x.ion === ion)?.share ?? 0;
      const leaky = this.P[ion] > 0;

      ctx.strokeStyle = withAlpha(pal.grid, 0.9);
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Rope
      if (ok && leaky && share > 0.002) {
        ctx.strokeStyle = withAlpha(color, 0.85);
        ctx.lineWidth = (1.5 + 18 * share) * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(xE, y);
        ctx.lineTo(xV, y);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      // Team
      const r = 5.2 * s;
      const a = leaky ? 1 : 0.3;
      for (const [dx, dy] of [
        [-7, -4],
        [7, -4],
        [0, 6],
      ])
        drawIon(ctx, info.shape, xE + dx * s, y + dy * s, r, withAlpha(color, a));
      ctx.font = font(10, true);
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = withAlpha(color, leaky ? 1 : 0.55);
      const label = `E ${sfmt(E, 0)}`;
      const tw = ctx.measureText(label).width;
      ctx.textAlign = 'center';
      ctx.fillText(label, Math.min(x1 - tw / 2, Math.max(x0 + tw / 2, xE)), y - 13 * s);

      // E marker on the axis
      ctx.beginPath();
      ctx.moveTo(xE, axisY - 1);
      ctx.lineTo(xE - 5 * s, axisY - 9 * s);
      ctx.lineTo(xE + 5 * s, axisY - 9 * s);
      ctx.closePath();
      ctx.fillStyle = withAlpha(color, a);
      ctx.fill();

      // Lane label
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = font(13, true);
      ctx.fillStyle = color;
      ctx.fillText(info.symbol, 8, y - 1);
      ctx.font = font(10.5);
      ctx.fillStyle = pal.muted;
      ctx.textBaseline = 'top';
      ctx.fillText(leaky ? (ok ? `${Math.round(share * 100)} %` : '') : 'no leak', 8, y + 3);
    });

    // Pump lane
    const py = laneY(3);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = font(12, true);
    ctx.fillStyle = pal.text;
    ctx.fillText('Pump', 8, py - 1);
    ctx.font = font(10.5);
    ctx.fillStyle = pal.muted;
    ctx.textBaseline = 'top';
    ctx.fillText(this.pump ? '3 : 2' : 'off', 8, py + 3);
    if (ok && this.pump) {
      const xa = X(Vleak);
      const d = xV - xa;
      ctx.strokeStyle = pal.accent;
      ctx.fillStyle = pal.accent;
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(xa, py);
      ctx.lineTo(xV - Math.sign(d) * 6 * s, py);
      ctx.stroke();
      if (Math.abs(d) > 3) {
        ctx.beginPath();
        ctx.moveTo(xV, py);
        ctx.lineTo(xV - Math.sign(d) * 8 * s, py - 6 * s);
        ctx.lineTo(xV - Math.sign(d) * 8 * s, py + 6 * s);
        ctx.closePath();
        ctx.fill();
      }
      ctx.font = font(10.5);
      ctx.textBaseline = 'bottom';
      ctx.textBaseline = 'middle';
      const text = `its own current ${sfmt(V - Vleak, 1)} mV`;
      const w = ctx.measureText(text).width;
      const right = Math.max(xa, xV) + 12;
      ctx.textAlign = 'left';
      ctx.fillText(text, right + w < x1 ? right : Math.max(x0 + 2, Math.min(xa, xV) - w - 12), py);
    } else if (ok) {
      ctx.font = font(10.5);
      ctx.fillStyle = pal.faint;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      let text = 'No pump: nothing replaces what leaks.';
      let w = ctx.measureText(text).width;
      if (xV + 14 + w > x1 && xV - w - 14 < x0) {
        text = 'No pump';
        w = ctx.measureText(text).width;
      }
      ctx.fillText(text, xV + 14 + w < x1 ? xV + 14 : Math.max(x0 + 2, xV - w - 14), py);
    }

    if (!ok) {
      ctx.fillStyle = pal.muted;
      ctx.font = font(12, true);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No ion can cross: nothing sets a voltage.', (x0 + x1) / 2, top - 22 * s);
      return;
    }

    // The knot: the resting potential
    ctx.strokeStyle = pal.text;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(xV, top - 10 * s);
    ctx.lineTo(xV, axisY);
    ctx.stroke();
    ctx.fillStyle = pal.text;
    ctx.beginPath();
    ctx.arc(xV, axisY, 6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = font(14, true);
    const pill = `${sfmt(V, 1)} mV`;
    const pw = ctx.measureText(pill).width + 18 * s;
    const ph = 26 * s;
    const px = Math.min(x1 - pw, Math.max(4, xV - pw / 2));
    ctx.fillStyle = pal.text;
    roundRect(ctx, px, 8, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = pal.surface;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pill, px + pw / 2, 8 + ph / 2 + 1);
  }

  private drawGrad(pal: ReturnType<RestingBuilderElement['palette']>): void {
    const { w: W, h: H } = fitCanvas(this.grad);
    const ctx = this.grad.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const s = this.hasAttribute('present') ? 1.25 : 1;
    const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${Math.round(px * s)}px ${pal.mono || 'monospace'}`;
    const L = 40 * s;
    const R = 8;
    const band = 30 * s;
    const mx = (L + W - R) / 2;
    const top = 30 * s;
    const bottom = H - 40 * s;
    const rowH = (bottom - top) / 3;
    const valueRoom = 40 * s;
    const half = mx - band / 2 - L - valueRoom;

    let maxC = 0;
    for (const ion of ION_ORDER) maxC = Math.max(maxC, this.C[ion].in, this.C[ion].out, this.rest[ion].in);
    maxC = Math.max(150, Math.ceil(maxC / 50) * 50);
    const len = (c: number) => (Math.min(c, maxC) / maxC) * half;

    // Headers
    ctx.font = font(10.5, true);
    ctx.fillStyle = pal.faint;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.fillText('INSIDE', mx - band / 2 - 6, 8);
    ctx.textAlign = 'left';
    ctx.fillText('OUTSIDE', mx + band / 2 + 6, 8);

    // Membrane band
    ctx.fillStyle = withAlpha(pal.membrane, 0.6);
    ctx.fillRect(mx - band / 2, top - 6, band, bottom - top + 12);
    ctx.fillStyle = pal.membraneEdge;
    const hr = 3.2 * s;
    for (let y = top - 6 + hr; y < bottom + 6 - hr / 2; y += hr * 2.3) {
      ctx.beginPath();
      ctx.arc(mx - band / 2 + hr, y, hr, 0, Math.PI * 2);
      ctx.arc(mx + band / 2 - hr, y, hr, 0, Math.PI * 2);
      ctx.fill();
    }

    const Vleak = this.Vleak();
    const flux = ION_ORDER.map((ion) =>
      Number.isFinite(Vleak) ? ghkFlux(ion, this.P[ion], this.C[ion].in, this.C[ion].out, Vleak, this.tempC) : 0,
    );
    const maxJ = Math.max(1e-9, ...flux.map(Math.abs));

    ION_ORDER.forEach((ion, i) => {
      const color = pal[ion];
      const info = IONS[ion];
      const y = top + rowH * (i + 0.5);
      const bh = Math.min(26 * s, rowH * 0.42);
      const cin = this.C[ion].in;
      const cout = this.C[ion].out;

      ctx.font = font(13, true);
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.symbol, 6, y);

      // Inside bar grows leftwards from the membrane, outside bar rightwards.
      const li = len(cin);
      const lo = len(cout);
      ctx.fillStyle = withAlpha(color, 0.75);
      roundRect(ctx, mx - band / 2 - 2 - li, y - bh / 2, li, bh, 4);
      ctx.fill();
      roundRect(ctx, mx + band / 2 + 2, y - bh / 2, lo, bh, 4);
      ctx.fill();
      // Where the pump holds the inside value
      if (Math.abs(cin - this.rest[ion].in) > 0.4) {
        const xr = mx - band / 2 - 2 - len(this.rest[ion].in);
        ctx.strokeStyle = pal.faint;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(xr, y - bh / 2 - 5);
        ctx.lineTo(xr, y + bh / 2 + 5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.font = font(10.5);
      ctx.fillStyle = pal.text;
      ctx.textAlign = 'right';
      ctx.fillText(cText(cin), mx - band / 2 - 6 - li, y);
      ctx.textAlign = 'left';
      ctx.fillText(cText(cout), mx + band / 2 + 6 + lo, y);

      // Net leak across the membrane
      const J = flux[i];
      if (this.P[ion] > 0 && Math.abs(J) > maxJ * 0.02) {
        const dir = Math.sign(J); // + = outward = rightwards
        const a = 0.35 + 0.65 * Math.min(1, Math.abs(J) / maxJ);
        const half2 = band / 2 + 6 * s;
        ctx.strokeStyle = withAlpha(pal.text, a);
        ctx.fillStyle = withAlpha(pal.text, a);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(mx - dir * half2, y + bh / 2 + 9 * s);
        ctx.lineTo(mx + dir * (half2 - 6), y + bh / 2 + 9 * s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx + dir * half2, y + bh / 2 + 9 * s);
        ctx.lineTo(mx + dir * (half2 - 7), y + bh / 2 + 5 * s);
        ctx.lineTo(mx + dir * (half2 - 7), y + bh / 2 + 13 * s);
        ctx.closePath();
        ctx.fill();
      }
    });

    // Footer: the clock, or the pump's work
    ctx.font = font(10.5);
    ctx.fillStyle = pal.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    let foot: string;
    if (!this.pump) foot = this.hours > 0 ? `Pump off for ${this.hours.toFixed(1)} h: the leaks change the inside` : 'Pump off: the leaks will slowly change the inside';
    else if (this.drifted()) foot = 'Pump on: winning back the gradients';
    else foot = 'Pump on: it puts back exactly what leaks';
    ctx.fillText(foot, W / 2, H - 6);
  }
}

if (!customElements.get('nc-resting-builder')) customElements.define('nc-resting-builder', RestingBuilderElement);
