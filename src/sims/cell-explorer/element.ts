import { SimElement, type PredictQuestion } from '../shared/sim-element';
import {
  isPartId,
  JOURNEY,
  JOURNEY_LENGTH,
  part,
  PARTS,
  ROLES,
  SHAPES,
  stageAt,
  stageStart,
  stepPart,
  type PartId,
} from './model';
import { PART_BOX, ROUTE, sceneSvg, shapeSvg, VIEW } from './scene';

/**
 * <nc-cell-explorer>: meet the cells of the nervous system. Click any part of a motor neuron
 * or the glia around it to see what it does, or follow one signal from a synapse on a
 * dendrite all the way to a muscle. A second tab shows the three neuron shapes.
 *
 * Attributes: preset, part, view ("cells" | "shapes"), predict, present, lab-href.
 */

type View = 'cells' | 'shapes';

/** Named starting points for "Try this" cards. Any part id also works as a preset. */
export const CELL_PRESETS = ['overview', 'follow', 'glia', 'myelin', 'shapes'] as const;

const HILLOCK_QUESTION: PredictQuestion = {
  id: 'where-fire',
  question: 'A message is about to arrive on a dendrite. Where does the neuron “decide” whether to fire an action potential?',
  options: ['In the dendrite, where the message arrives.', 'At the axon hillock, where the axon begins.', 'At the terminal buttons, at the far end.'],
  correct: 1,
  explain:
    'Small voltage changes from many dendrites add up in the cell body. The axon hillock, packed with sodium channels, is where they can trigger an action potential.',
};

const GLIA_SWATCH: Partial<Record<PartId, string>> = {
  astrocyte: 'var(--good)',
  oligodendrocyte: 'var(--ion-k)',
  schwann: 'var(--ion-na)',
  microglia: 'var(--ion-ca)',
};

const DEFAULT_CAPTION =
  'Click or tap any part of the picture, or pick one below, to see what it does. Press “Follow the signal” to watch one message travel from a synapse to a muscle.';

export class CellExplorerElement extends SimElement {
  private selected: PartId | null = null;
  private view: View = 'cells';
  private t = 0;
  private journeyOn = false;
  private stageShown = -1;
  private labels = true;
  private zoom = false;
  private autoLayout = true;
  private vb = { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
  private vbAnim = 0;
  private svg!: SVGSVGElement;
  private dendRoute!: SVGPathElement;
  private dots: SVGCircleElement[] = [];

  static get observedAttributes() {
    return ['present'];
  }

  attributeChangedCallback() {
    this.render();
  }

  protected build(): void {
    const chip = (id: PartId) => {
      const sw = GLIA_SWATCH[id];
      return `<button type="button" class="chip" data-part="${id}" aria-pressed="false">${sw ? `<i class="sw" style="background: ${sw}" aria-hidden="true"></i>` : ''}${part(id).name}</button>`;
    };
    this.html(`
      <style>
        .tabs { margin-bottom: var(--sim-gap); }
        .tabs [role='tab'][aria-selected='true'] { background: var(--accent-soft); border-color: var(--accent); color: var(--text); font-weight: 700; }
        .stage { display: grid; gap: var(--sim-gap); grid-template-columns: 1fr; }
        @container (min-width: 760px) { .stage { grid-template-columns: minmax(0, 2.3fr) minmax(15rem, 1fr); } }
        .scene-wrap { border: 1px solid var(--border); border-radius: var(--radius, 12px); background: var(--surface); overflow: hidden; }
        svg.scene { display: block; width: 100%; height: auto; aspect-ratio: 1000 / 560; touch-action: manipulation; }
        svg.scene .region { font: 600 12px var(--font-mono, monospace); fill: var(--text-faint); letter-spacing: 0.06em; }
        svg.scene .ctx-label { font: italic 13px var(--font-body, sans-serif); fill: var(--text-faint); }
        svg.scene .lbl text { font: 700 15px var(--font-body, sans-serif); fill: var(--text); paint-order: stroke; stroke: var(--surface); stroke-width: 4px; stroke-linejoin: round; }
        svg.scene .lbl line { stroke: var(--text-muted); stroke-width: 1.2; }
        svg.scene.no-labels .lbl { display: none; }
        svg.scene .hit, svg.scene .lbl { cursor: pointer; }
        svg.scene [data-parts] { transition: opacity 0.25s; }
        svg.scene.has-sel [data-parts]:not(.on) { opacity: 0.22; }
        svg.scene [data-parts].on { filter: drop-shadow(0 0 4px var(--focus)); }
        :host([data-reduce]) svg.scene [data-parts] { transition: none; }
        .info { background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius, 12px); padding: 0.85rem 1rem; }
        .info .tag { margin: 0; font: 600 0.75em var(--font-mono, monospace); letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-muted); }
        .info h3 { margin: 0.25rem 0 0.4rem; font-size: 1.2em; line-height: 1.25; }
        .info p { margin: 0 0 0.5rem; line-height: 1.5; }
        .info .jh { margin: 0.7rem 0 0.2rem; font-weight: 700; font-size: 0.88em; color: var(--text-muted); }
        .chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-top: 0.4rem; }
        .chip { font-size: 0.88em; display: inline-flex; align-items: center; gap: 0.4rem; }
        .chip .sw { width: 0.8rem; height: 0.8rem; border-radius: 50%; display: inline-block; }
        .shapes { display: grid; gap: var(--sim-gap); grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
        .shape { margin: 0; background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius, 12px); padding: 0.75rem; }
        .shape svg { display: block; width: 100%; height: auto; aspect-ratio: 300 / 200; background: var(--surface); border-radius: 8px; }
        .shape .sh-lbl { font: 600 13px var(--font-body, sans-serif); fill: var(--text-muted); }
        .shape figcaption { font-size: 1rem; color: var(--text); }
        .shape h3 { margin: 0.6rem 0 0.2rem; font-size: 1.1em; }
        .shape h3 small { font-weight: 400; color: var(--text-muted); }
        .shape p { margin: 0.25rem 0; line-height: 1.5; }
        .shape .ex { color: var(--text-muted); font-size: 0.92em; }
        .role { display: inline-block; margin: 0.3rem 0.3rem 0 0; padding: 0.1rem 0.55rem; border-radius: 999px; background: var(--surface-3); font-size: 0.82em; font-weight: 600; }
        .roles { margin-top: var(--sim-gap); display: grid; gap: 0.4rem; }
        .roles p { margin: 0; }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Meet the cells<small>One motor neuron and the glia around it · not to scale</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Follow the signal"><span aria-hidden="true">▶</span> <span class="lbl">Follow the signal</span></button>
            <button class="step" type="button" aria-label="Next step of the journey" title="Next step">⏭</button>
            <button class="reset" type="button" aria-label="Reset" title="Reset">↺</button>
          </div>
        </div>
        <div class="tabs" role="tablist" aria-label="What to show">
          <button type="button" role="tab" class="tab" id="tab-cells" data-view="cells" aria-controls="panel-cells" aria-selected="true">The cells</button>
          <button type="button" role="tab" class="tab" id="tab-shapes" data-view="shapes" aria-controls="panel-shapes" aria-selected="false" tabindex="-1">Neuron shapes</button>
        </div>
        <p class="caption" aria-live="off"></p>
        <div id="panel-cells" role="tabpanel" aria-labelledby="tab-cells">
          <div class="stage">
            <div class="scene-wrap">
              <svg class="scene" viewBox="0 0 ${VIEW.w} ${VIEW.h}" aria-hidden="true" focusable="false">${sceneSvg()}</svg>
            </div>
            <aside class="info" aria-label="About the selected part">
              <p class="tag"></p>
              <h3 class="name"></h3>
              <p class="job"></p>
              <p class="jh">In the signal’s journey</p>
              <p class="journey"></p>
              <div class="row">
                <button type="button" class="prev" aria-label="Previous part">◀ Previous</button>
                <button type="button" class="next" aria-label="Next part">Next ▶</button>
              </div>
            </aside>
          </div>
          <div class="controls">
            <fieldset>
              <legend>Parts of the neuron</legend>
              <div class="chips">${PARTS.filter((p) => p.group === 'neuron')
                .map((p) => chip(p.id))
                .join('')}</div>
            </fieldset>
            <fieldset>
              <legend>Glial cells</legend>
              <div class="chips">${PARTS.filter((p) => p.group === 'glia')
                .map((p) => chip(p.id))
                .join('')}</div>
            </fieldset>
            <fieldset>
              <legend>Options</legend>
              <label class="toggle"><input type="checkbox" class="labels-box" /><span>Show labels</span></label>
              <label class="toggle"><input type="checkbox" class="zoom-box" /><span>Zoom in on the chosen part<small>Handy on a small screen</small></span></label>
              <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Ask before the signal sets off</small></span></label>
              <div class="row"><button class="link" type="button">Copy link</button></div>
              <p class="keys">Keys: <kbd>←</kbd> <kbd>→</kbd> previous or next part · <kbd>Space</kbd> follow the signal · <kbd>L</kbd> labels · <kbd>Esc</kbd> clear · <kbd>R</kbd> reset</p>
            </fieldset>
          </div>
        </div>
        <div id="panel-shapes" role="tabpanel" aria-labelledby="tab-shapes" hidden>
          <div class="shapes">
            ${SHAPES.map(
              (s) => `<figure class="shape">
                <svg viewBox="0 0 300 200" role="img" aria-label="${s.name} neuron: ${s.text}">${shapeSvg(s.id)}</svg>
                <figcaption>
                  <h3>${s.name}${s.alsoCalled ? ` <small>(also called ${s.alsoCalled})</small>` : ''}</h3>
                  <p>${s.text}</p>
                  <p class="ex">${s.examples}</p>
                  <div>${s.roles.map((r) => `<span class="role">${ROLES[r].name}</span>`).join('')}</div>
                </figcaption>
              </figure>`,
            ).join('')}
          </div>
          <div class="roles">
            ${Object.values(ROLES)
              .map((r) => `<p><b>${r.name}:</b> ${r.text}</p>`)
              .join('')}
            <p class="note">Yellow arrows show which way signals flow: in through the dendrites, out along the axon.</p>
          </div>
        </div>
      </div>`);
    this.svg = this.root.querySelector('svg.scene') as SVGSVGElement;
    this.dendRoute = this.svg.querySelector('.route-dend') as SVGPathElement;
    const tg = this.svg.querySelector('.transmitter')!;
    for (let i = 0; i < 6; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '2.6');
      c.setAttribute('fill', 'var(--warn)');
      c.setAttribute('opacity', '0');
      tg.append(c);
      this.dots.push(c);
    }

    const view = this.getAttribute('view');
    const p = this.getAttribute('part');
    this.applyPreset(this.getAttribute('preset') ?? 'overview', false);
    if (isPartId(p)) this.select(p, false);
    if (view === 'shapes') this.setView('shapes', false);
    this.wire();
    this.syncOptions();
  }

  /** Apply a named preset, e.g. from a "Try this" button. A part id selects that part. */
  applyPreset(name: string, announce = true): void {
    if (!this.svg) return;
    this.stopJourney();
    if (name === 'shapes') {
      this.select(null, false);
      this.setView('shapes', announce);
      return;
    }
    this.setView('cells', false);
    if (name === 'follow') {
      this.select(null, false);
      void this.startJourney();
      return;
    }
    const target: PartId | null = name === 'glia' ? 'astrocyte' : name === 'myelin' ? 'myelin' : isPartId(name) ? name : null;
    this.select(target, announce);
  }

  private wire(): void {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => {
      if (this.playing) this.pause();
      else void this.startJourney();
    });
    on('.step', 'click', () => this.stepOnce());
    on('.reset', 'click', () => this.reset());
    on('.prev', 'click', () => this.select(stepPart(this.selected, -1)));
    on('.next', 'click', () => this.select(stepPart(this.selected, 1)));
    this.root.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) =>
      b.addEventListener('click', () => {
        this.stopJourney();
        this.select(b.dataset.part as PartId);
      }),
    );
    this.svg.addEventListener('click', (e) => {
      const el = (e.target as Element).closest('[data-parts]');
      if (!el) {
        if (!this.journeyOn) this.select(null);
        return;
      }
      const id = el.getAttribute('data-parts')!.split(' ')[0];
      if (isPartId(id)) {
        this.stopJourney();
        this.select(id);
      }
    });
    const tabs = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => this.setView(t.dataset.view as View));
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        e.stopPropagation();
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
        next.focus();
        this.setView(next.dataset.view as View);
      });
    });
    on('.labels-box', 'change', (e) => {
      this.autoLayout = false;
      this.labels = (e.target as HTMLInputElement).checked;
      this.syncOptions();
    });
    on('.zoom-box', 'change', (e) => {
      this.autoLayout = false;
      this.zoom = (e.target as HTMLInputElement).checked;
      this.zoomTo(this.zoom ? this.selected : null);
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || target?.getAttribute('role') === 'tab') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (this.view !== 'cells') return;
        e.preventDefault();
        this.stopJourney();
        this.select(stepPart(this.selected, e.key === 'ArrowRight' ? 1 : -1));
      } else if (e.key === ' ' && tag !== 'BUTTON') {
        e.preventDefault();
        if (this.playing) this.pause();
        else void this.startJourney();
      } else if (e.key === 'Escape') {
        this.stopJourney();
        this.select(null);
      } else if (e.key === 'l' || e.key === 'L') {
        this.autoLayout = false;
        this.labels = !this.labels;
        this.syncOptions();
      } else if (e.key === 'r' || e.key === 'R') {
        this.reset();
      }
    });
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
  }

  private syncOptions(): void {
    (this.$('.labels-box') as HTMLInputElement).checked = this.labels;
    (this.$('.zoom-box') as HTMLInputElement).checked = this.zoom;
    (this.$('.predict') as HTMLInputElement).checked = this.predictEnabled;
    this.svg.classList.toggle('no-labels', !this.labels);
  }

  private setView(v: View, announce = true): void {
    this.view = v;
    if (v === 'shapes') this.stopJourney();
    this.root.querySelectorAll<HTMLButtonElement>('[role="tab"]').forEach((t) => {
      const sel = t.dataset.view === v;
      t.setAttribute('aria-selected', String(sel));
      t.tabIndex = sel ? 0 : -1;
    });
    (this.$('#panel-cells') as HTMLElement).hidden = v !== 'cells';
    (this.$('#panel-shapes') as HTMLElement).hidden = v !== 'shapes';
    this.$('.play').toggleAttribute('disabled', v !== 'cells');
    this.$('.step').toggleAttribute('disabled', v !== 'cells');
    this.setCaption(
      v === 'shapes'
        ? 'Neurons come in different shapes. The shape depends on how many branches leave the cell body, and it fits the job.'
        : this.cellsCaption(),
    );
    if (announce) this.announce(v === 'shapes' ? 'Neuron shapes: multipolar, bipolar and unipolar.' : 'The cells.', true);
  }

  private cellsCaption(): string {
    if (this.journeyOn) {
      const s = JOURNEY[stageAt(this.t).index];
      return `${s.title}. ${s.text}`;
    }
    return DEFAULT_CAPTION;
  }

  private select(id: PartId | null, announce = true): void {
    this.selected = id;
    this.svg.querySelectorAll('[data-parts]').forEach((el) => {
      const parts = el.getAttribute('data-parts')!.split(' ');
      el.classList.toggle('on', !!id && parts.includes(id));
    });
    this.svg.classList.toggle('has-sel', !!id);
    this.root.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.part === id)));
    const info = this.$('.info');
    if (!id) {
      this.$('.tag').textContent = 'Meet the cells';
      this.$('.name').textContent = 'A motor neuron and its helpers';
      this.$('.job').textContent =
        'This neuron’s cell body sits in the spinal cord. Its axon leaves through a nerve and ends on a muscle. Around it are the four kinds of glia. Pick any part to find out what it does.';
      this.$('.journey').textContent = 'Press “Follow the signal” to watch one message travel from a synapse on a dendrite to the muscle.';
    } else {
      const p = part(id);
      this.$('.tag').textContent = p.group === 'glia' ? p.where : `Neuron · ${p.where}`;
      this.$('.name').textContent = p.name;
      this.$('.job').textContent = p.job;
      this.$('.journey').textContent = p.journey;
      if (announce) this.announce(`${p.name}. ${p.job}`, true);
    }
    info.dataset.part = id ?? '';
    if (this.zoom) this.zoomTo(id);
  }

  /** Smoothly move the view box to a part, or back to the whole scene. */
  private zoomTo(id: PartId | null): void {
    const aspect = VIEW.w / VIEW.h;
    let target = { x: 0, y: 0, w: VIEW.w, h: VIEW.h };
    if (id) {
      let [x, y, w, h] = PART_BOX[id];
      const cx = x + w / 2;
      const cy = y + h / 2;
      w = Math.max(w * 1.15, 420);
      h = Math.max(h * 1.15, w / aspect);
      w = Math.max(w, h * aspect);
      h = w / aspect;
      if (w >= VIEW.w) {
        w = VIEW.w;
        h = VIEW.h;
      }
      x = Math.min(VIEW.w - w, Math.max(0, cx - w / 2));
      y = Math.min(VIEW.h - h, Math.max(0, cy - h / 2));
      target = { x, y, w, h };
    }
    cancelAnimationFrame(this.vbAnim);
    const from = { ...this.vb };
    const apply = (b: typeof target) => {
      this.vb = b;
      this.svg.setAttribute('viewBox', `${b.x.toFixed(1)} ${b.y.toFixed(1)} ${b.w.toFixed(1)} ${b.h.toFixed(1)}`);
    };
    if (this.reducedMotion) {
      apply(target);
      return;
    }
    const t0 = performance.now();
    const dur = 450;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      apply({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        w: from.w + (target.w - from.w) * e,
        h: from.h + (target.h - from.h) * e,
      });
      if (k < 1) this.vbAnim = requestAnimationFrame(step);
    };
    this.vbAnim = requestAnimationFrame(step);
  }

  // ---------- Follow the signal ----------

  private async startJourney(): Promise<void> {
    if (this.view !== 'cells') this.setView('cells', false);
    if (!this.journeyOn || this.t >= JOURNEY_LENGTH) {
      if (this.t === 0 || this.t >= JOURNEY_LENGTH) await this.ask(HILLOCK_QUESTION);
      this.t = 0;
      this.stageShown = -1;
      this.journeyOn = true;
    }
    this.play();
  }

  private stopJourney(): void {
    if (this.playing) this.pause();
    if (!this.journeyOn) return;
    this.journeyOn = false;
    this.t = 0;
    this.stageShown = -1;
    this.hideSignal();
    this.setCaption(this.cellsCaption());
    this.onPlayState();
  }

  protected onPlayState(): void {
    const b = this.root.querySelector('.play');
    if (!b) return;
    const mid = this.journeyOn && this.t > 0 && this.t < JOURNEY_LENGTH;
    const label = this.playing ? 'Pause' : mid ? 'Continue' : 'Follow the signal';
    b.setAttribute('aria-label', label);
    b.querySelector('span[aria-hidden]')!.textContent = this.playing ? '❚❚' : '▶';
    b.querySelector('.lbl')!.textContent = label;
  }

  reset(): void {
    this.stopJourney();
    this.select(null, false);
    if (this.zoom) this.zoomTo(null);
    this.setView('cells', false);
    this.announce('Reset.', true);
  }

  stepOnce(): void {
    if (this.view !== 'cells') return;
    this.pause();
    let idx = this.journeyOn ? stageAt(this.t).index + 1 : 0;
    if (idx >= JOURNEY.length) idx = 0;
    this.journeyOn = true;
    this.t = stageStart(idx) + JOURNEY[idx].dur * 0.8;
    this.render();
    this.onPlayState();
  }

  protected tick(dtReal: number): void {
    if (!this.journeyOn) return;
    this.t += dtReal;
    if (this.t >= JOURNEY_LENGTH) {
      this.t = JOURNEY_LENGTH;
      this.pause();
      this.announce('The muscle fibre twitches. That is the end of the journey.', true);
    }
  }

  private hideSignal(): void {
    if (!this.svg) return;
    this.svg.querySelector('.sig')!.setAttribute('opacity', '0');
    this.svg.querySelector('.sig-ring')!.setAttribute('opacity', '0');
    this.svg.querySelector('.sig-trail')!.setAttribute('opacity', '0');
    this.svg.querySelector('.muscle-flash')!.setAttribute('opacity', '0');
    for (const d of this.dots) d.setAttribute('opacity', '0');
  }

  private drawSignal(): void {
    const { index, p: pRaw } = stageAt(this.t);
    const p = this.reducedMotion && !this.playing ? Math.max(pRaw, 0.8) : pRaw;
    if (index !== this.stageShown) {
      this.stageShown = index;
      const s = JOURNEY[index];
      this.select(s.part, false);
      this.setCaption(`${s.title}. ${s.text}`);
      this.announce(`${s.title}. ${s.text}`, true);
    }
    this.hideSignal();
    const sig = this.svg.querySelector('.sig')!;
    const ring = this.svg.querySelector('.sig-ring')!;
    const trail = this.svg.querySelector('.sig-trail')!;
    const flash = this.svg.querySelector('.muscle-flash')!;
    const put = (x: number, y: number, r: number, a: number) => {
      sig.setAttribute('cx', x.toFixed(1));
      sig.setAttribute('cy', y.toFixed(1));
      sig.setAttribute('r', r.toFixed(1));
      sig.setAttribute('opacity', a.toFixed(2));
    };
    const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
    const [bx, by] = ROUTE.bouton;
    const [sx, sy] = ROUTE.spineHead;
    switch (index) {
      case 0: {
        this.dots.forEach((d, i) => {
          const k = Math.min(1, Math.max(0, p * 1.5 - i * 0.1));
          d.setAttribute('cx', (lerp(bx, sx, k) + ((i % 3) - 1) * 3).toFixed(1));
          d.setAttribute('cy', (lerp(by, sy, k) + ((i % 2) - 0.5) * 3).toFixed(1));
          d.setAttribute('opacity', k > 0 && k < 1 ? '1' : '0');
        });
        if (p > 0.55) put(sx, sy, 10 + 8 * (p - 0.55), (p - 0.55) / 0.45);
        break;
      }
      case 1: {
        const len = this.dendRoute.getTotalLength();
        const pt = this.dendRoute.getPointAtLength(p * len);
        put(pt.x, pt.y, 16 - 5 * p, 1 - 0.45 * p);
        break;
      }
      case 2: {
        const [cx, cy] = ROUTE.soma;
        put(cx, cy, 20 + 10 * p, 0.45 + 0.4 * p);
        ring.setAttribute('r', (12 + 46 * p).toFixed(1));
        ring.setAttribute('opacity', (1 - p).toFixed(2));
        break;
      }
      case 3: {
        const [hx, hy] = ROUTE.hillock;
        const fire = p > 0.6;
        put(hx, hy, fire ? 26 : 12 + 8 * p, fire ? 1 : 0.5 + 0.5 * p);
        break;
      }
      case 4: {
        const xs = ROUTE.nodes;
        const k = Math.min(xs.length - 1, Math.floor(p * xs.length));
        put(xs[k], 330, 22, 1);
        if (k > 0) {
          let d = `M ${xs[0]} 330`;
          for (let i = 1; i <= k; i++) d += ` Q ${(xs[i - 1] + xs[i]) / 2} 296 ${xs[i]} 330`;
          trail.setAttribute('d', d);
          trail.setAttribute('opacity', '0.85');
        }
        break;
      }
      default: {
        const q = Math.min(1, p / 0.35);
        if (p < 0.4) put(866 + 30 * q, 330, 18, 1);
        if (p > 0.3) {
          const k = Math.min(1, (p - 0.3) / 0.3);
          this.dots.forEach((d, i) => {
            const [tx, ty] = ROUTE.buttons[i % ROUTE.buttons.length];
            d.setAttribute('cx', (tx + 4 + 8 * k + (i >= 4 ? 3 : 0)).toFixed(1));
            d.setAttribute('cy', (ty + (i >= 4 ? 4 : -2)).toFixed(1));
            d.setAttribute('opacity', k < 1 ? '1' : '0');
          });
        }
        if (p > 0.5) flash.setAttribute('opacity', Math.sin((Math.PI * (p - 0.5)) / 0.5).toFixed(2));
      }
    }
  }

  // ---------- Words and links ----------

  private setCaption(text: string): void {
    const el = this.root.querySelector('.caption');
    if (el && el.textContent !== text) el.textContent = text;
  }

  private async copyLink(): Promise<void> {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    if (this.view === 'shapes') u.searchParams.set('view', 'shapes');
    else if (this.selected) u.searchParams.set('part', this.selected);
    const btn = this.$('.link');
    try {
      await navigator.clipboard.writeText(u.toString());
      btn.textContent = 'Link copied';
    } catch {
      prompt('Copy this link:', u.toString());
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
  }

  protected render(): void {
    if (!this.svg) return;
    this.toggleAttribute('data-reduce', this.reducedMotion);
    if (this.autoLayout) {
      const w = this.getBoundingClientRect().width;
      if (w > 0) {
        this.autoLayout = false;
        this.labels = w >= 600;
        this.zoom = w < 600;
        this.syncOptions();
        if (this.zoom && this.selected) this.zoomTo(this.selected);
      }
    }
    if (this.journeyOn) this.drawSignal();
  }
}

if (!customElements.get('nc-cell-explorer')) customElements.define('nc-cell-explorer', CellExplorerElement);
