import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { fitCanvas, readPalette, roundRect, withAlpha } from '../shared/canvas';
import { click, unlockAudio } from '../shared/audio';
import { setSetting, soundOn } from '../shared/settings';
import { AXONS, Axon, DT, MYELIN, race, TRACK_UM, type StimSite } from './model';

/**
 * <nc-conduction>: a race between axons. Fire all three at once and watch the spike travel
 * along each one, computed by a cable model with Hodgkin–Huxley channels. Strip the myelin
 * from a stretch of one axon and watch the spike slow down or die.
 *
 * Attributes: preset, lanes ("thin,thick,myelinated"), damage (0–100), stim ("start" | "middle"),
 * speed (model ms per second), predict, present, lab-href.
 */

interface Preset {
  lanes: string[];
  damage?: number;
  stim?: StimSite;
  speed?: number;
  fire?: boolean;
  caption?: string;
}

export const CONDUCTION_PRESETS: Record<string, Preset> = {
  race: { lanes: ['thin', 'thick', 'myelinated'], fire: true },
  ready: { lanes: ['thin', 'thick', 'myelinated'], fire: false },
  'thin-vs-thick': {
    lanes: ['thin', 'thick', 'squid'],
    fire: true,
    caption: 'Three bare axons, each fatter than the last. Fatter axons have less resistance inside, so current spreads further ahead.',
  },
  'giant-vs-myelin': {
    lanes: ['squid', 'myelinated', 'myelinated-thin'],
    fire: true,
    caption: 'The squid’s giant axon is 50 times wider than the myelinated one. Which wins?',
  },
  jump: {
    lanes: ['thick', 'myelinated', 'myelinated-thin'],
    speed: 0.1,
    fire: true,
    caption: 'Slow motion: watch the spike jump from node to node in the myelinated axons.',
  },
  'ms-mild': {
    lanes: ['myelinated', 'damaged', 'thick'],
    damage: 60,
    speed: 0.25,
    fire: true,
    caption: 'The middle lane has lost 60 percent of its myelin over a 3 mm stretch, as in a patch of multiple sclerosis.',
  },
  'ms-severe': {
    lanes: ['myelinated', 'damaged', 'thick'],
    damage: 100,
    speed: 0.25,
    fire: true,
    caption: 'All the myelin is gone from the middle stretch of the middle lane.',
  },
  middle: {
    lanes: ['thin', 'thick', 'myelinated'],
    stim: 'middle',
    fire: true,
    caption: 'This time the electrode zaps the middle of each axon.',
  },
};

const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5];
const LANE_CHOICES = ['thin', 'thick', 'squid', 'myelinated', 'myelinated-thin', 'damaged'];

const QUESTIONS = {
  damage: {
    id: 'damage',
    question: 'The middle lane has lost much of its myelin in the middle stretch. What will the spike do there?',
    options: ['Pass at the same speed.', 'Slow down, and maybe stop.', 'Speed up, because there is less in the way.'],
    correct: 1,
    explain:
      'Without myelin, the current leaking out of the axon has a lot more membrane to charge, so the next node takes longer to reach threshold. With enough damage it never does, and the spike dies.',
  } satisfies PredictQuestion,
};

interface Lane {
  key: string;
  axon: Axon;
  done: boolean;
  announced: boolean;
}

export class ConductionElement extends SimElement {
  private lanes: Lane[] = [];
  private laneKeys: string[] = ['thin', 'thick', 'myelinated'];
  private damage = 0;
  private stim: StimSite = 'start';
  private speed = 1;
  private fired = false;
  private finishedAll = false;
  private pinnedCaption: string | null = null;
  private lastReadout = 0;
  private canvas!: HTMLCanvasElement;

  static get observedAttributes() {
    return ['present'];
  }

  attributeChangedCallback() {
    this.render();
  }

  protected build(): void {
    this.html(`
      <style>
        .results { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.25rem; font-family: var(--font-mono, monospace); font-size: 0.85em; }
        .results li { display: flex; flex-wrap: wrap; gap: 0.2rem 0.6rem; }
        .results b { font-weight: 600; color: var(--text); min-width: 0; }
        .results span { color: var(--text-muted); }
        .lane-row { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
        .lane-row label { font-size: 0.88em; color: var(--text-muted); }
        .lane-row select { width: 100%; min-width: 0; border-radius: 10px; }
        .fire { font-size: 1.05em; }
        canvas.track { height: 360px; }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Conduction race<small>Three axons, 1 cm of track · cable model with Hodgkin–Huxley channels</small></div>
          <div class="transport">
            <button class="fire primary" type="button"><span aria-hidden="true">⚡</span> Fire all three</button>
            <button class="play" type="button" aria-label="Play"><span aria-hidden="true">▶</span> <span class="lbl">Play</span></button>
            <button class="step" type="button" aria-label="Step forward 0.02 milliseconds" title="Step 0.02 ms">⏭</button>
            <button class="reset" type="button" aria-label="Reset" title="Reset">↺</button>
            <label class="visually-hidden" for="speed">Speed</label>
            <select id="speed" class="speed" aria-label="Speed">
              ${SPEEDS.map((s) => `<option value="${s}">${s} ms per second</option>`).join('')}
            </select>
            <span class="timescale"></span>
          </div>
        </div>
        <p class="caption" aria-live="off"></p>
        <figure>
          <canvas class="track" role="img" aria-label="Three axons side by side, with the voltage along each one and a finish line on the right"></canvas>
          <figcaption>
            <span class="legend">
              <span><i class="line" style="background: var(--trace)"></i>Voltage along the axon</span>
              <span><i style="background: var(--excite)"></i>Firing membrane</span>
              <span><i style="background: var(--surface-3); border: 1px solid var(--text-muted)"></i>Myelin</span>
              <span>Widths are not to scale: the thin axon is drawn far too wide to see.</span>
            </span>
          </figcaption>
        </figure>
        <div class="readouts" role="group" aria-label="Race results">
          <span><b>Time</b><span class="r-time">0.00 ms</span></span>
        </div>
        <ol class="results" aria-label="Results for each lane"></ol>
        <div class="controls" style="margin-top: var(--sim-gap)">
          <fieldset>
            <legend>Choose the axons</legend>
            ${[0, 1, 2]
              .map(
                (i) => `<div class="lane-row"><label for="lane${i}">Lane ${i + 1}</label><select id="lane${i}" class="lane" data-i="${i}">
                ${LANE_CHOICES.map((k) => `<option value="${k}">${AXONS[k].label}</option>`).join('')}
              </select></div>`,
              )
              .join('')}
          </fieldset>
          <fieldset>
            <legend>Damage the myelin</legend>
            <div class="slider">
              <label for="damage">Myelin lost from a 3 mm stretch (affects the “damaged myelin” axon only)</label>
              <input id="damage" class="damage" type="range" min="0" max="100" step="5" />
              <output for="damage" class="o-damage"></output>
            </div>
            <p class="note">In multiple sclerosis, the immune system strips myelin from axons in the brain and spinal cord.</p>
          </fieldset>
          <fieldset>
            <legend>Options</legend>
            <label class="toggle"><input type="checkbox" class="middle" /><span>Zap the middle<small>Start the spike in the middle of each axon instead of at one end</small></span></label>
            <label class="toggle"><input type="checkbox" class="sound" /><span>Sound<small>A click when each spike crosses the finish line</small></span></label>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Ask before a race with damaged myelin</small></span></label>
            <div class="row">
              <button class="png" type="button">Save PNG</button>
              <button class="link" type="button">Copy link</button>
            </div>
            <p class="keys">Keys: <kbd>F</kbd> fire · <kbd>Space</kbd> play or pause · <kbd>S</kbd> step · <kbd>R</kbd> reset</p>
          </fieldset>
        </div>
      </div>`);

    this.canvas = this.$('canvas.track') as HTMLCanvasElement;
    const presetName = this.getAttribute('preset') ?? 'ready';
    const preset = CONDUCTION_PRESETS[presetName] ?? CONDUCTION_PRESETS.ready;
    this.applyPreset(presetName, false);
    const lanes = this.getAttribute('lanes');
    if (lanes) {
      const keys = lanes.split(',').map((s) => s.trim()).filter((k) => AXONS[k]);
      if (keys.length) this.laneKeys = [0, 1, 2].map((i) => keys[i] ?? keys[keys.length - 1]);
    }
    const dmg = Number(this.getAttribute('damage'));
    if (this.getAttribute('damage') !== null && Number.isFinite(dmg)) this.damage = Math.min(100, Math.max(0, dmg));
    const stim = this.getAttribute('stim');
    if (stim === 'start' || stim === 'middle') this.stim = stim;
    const speed = Number(this.getAttribute('speed'));
    if (SPEEDS.includes(speed)) this.speed = speed;
    this.buildLanes();
    this.syncControls();
    this.wire();
    this.setCaption(preset.caption ?? this.idleCaption());
  }

  /** Apply a named preset, e.g. from a "Try this" button. */
  applyPreset(name: string, start = true): void {
    const p = CONDUCTION_PRESETS[name] ?? CONDUCTION_PRESETS.race;
    this.laneKeys = [...p.lanes];
    this.damage = p.damage ?? 0;
    this.stim = p.stim ?? 'start';
    this.speed = p.speed ?? 1;
    this.pinnedCaption = p.caption ?? null;
    if (!this.canvas) return;
    this.buildLanes();
    this.syncControls();
    this.setCaption(p.caption ?? this.idleCaption());
    if (start && p.fire) void this.fire();
    else this.render();
  }

  private buildLanes(): void {
    this.lanes = this.laneKeys.map((key) => ({
      key,
      axon: new Axon(AXONS[key], { damage: this.damage / 100, stim: this.stim }),
      done: false,
      announced: false,
    }));
    this.fired = false;
    this.finishedAll = false;
    this.renderResults();
  }

  private syncControls(): void {
    this.root.querySelectorAll<HTMLSelectElement>('select.lane').forEach((s, i) => (s.value = this.laneKeys[i]));
    (this.$('.damage') as HTMLInputElement).value = String(this.damage);
    (this.$('.middle') as HTMLInputElement).checked = this.stim === 'middle';
    (this.$('.sound') as HTMLInputElement).checked = soundOn();
    (this.$('.predict') as HTMLInputElement).checked = this.predictEnabled;
    (this.$('.speed') as HTMLSelectElement).value = String(this.speed);
    this.updateOutputs();
  }

  private updateOutputs(): void {
    this.$('.o-damage').textContent = `${Math.round(this.damage)}%`;
    const slowdown = Math.round(1000 / this.speed);
    this.$('.timescale').textContent = `Slowed ${slowdown.toLocaleString('en-GB')}×`;
  }

  private wire(): void {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.fire', 'click', () => void this.fire());
    on('.play', 'click', () => {
      unlockAudio();
      if (!this.fired || this.finishedAll) void this.fire();
      else this.toggle();
    });
    on('.step', 'click', () => this.stepOnce());
    on('.reset', 'click', () => this.reset());
    on('.speed', 'change', (e) => {
      this.speed = Number((e.target as HTMLSelectElement).value);
      this.updateOutputs();
    });
    this.root.querySelectorAll<HTMLSelectElement>('select.lane').forEach((s) =>
      s.addEventListener('change', () => {
        this.laneKeys[Number(s.dataset.i)] = s.value;
        this.pinnedCaption = null;
        this.reset();
      }),
    );
    on('.damage', 'input', (e) => {
      this.damage = Number((e.target as HTMLInputElement).value);
      this.updateOutputs();
    });
    on('.damage', 'change', () => {
      this.pinnedCaption = null;
      if (!this.laneKeys.includes('damaged')) {
        this.setCaption('Choose the axon with damaged myelin for one of the lanes to see what the damage does.');
      }
      this.reset();
    });
    on('.middle', 'change', (e) => {
      this.stim = (e.target as HTMLInputElement).checked ? 'middle' : 'start';
      this.pinnedCaption = null;
      this.reset();
    });
    on('.sound', 'change', (e) => {
      const v = (e.target as HTMLInputElement).checked;
      if (v) unlockAudio();
      setSetting('sound', v);
    });
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    on('.png', 'click', () => this.savePng([this.canvas], 'Conduction race', 'conduction-race.png'));
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (tag === 'SELECT' || (tag === 'INPUT' && (target as HTMLInputElement).type === 'range')) return;
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'INPUT') {
        e.preventDefault();
        this.toggle();
      } else if (e.key === 'f' || e.key === 'F') {
        void this.fire();
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

  /** Start a new race. */
  async fire(): Promise<void> {
    unlockAudio();
    this.buildLanes();
    if (this.predictEnabled && this.stim === 'start') {
      if (this.laneKeys.includes('damaged') && this.damage >= 40) await this.ask(QUESTIONS.damage);
      else await this.ask(this.winnerQuestion());
    }
    this.fired = true;
    this.announce(`Race started: ${this.laneKeys.map((k) => AXONS[k].short).join(', ')}.`, true);
    if (!this.pinnedCaption) this.setCaption(this.runningCaption());
    this.play();
  }

  reset(): void {
    this.pause();
    this.buildLanes();
    if (!this.pinnedCaption) this.setCaption(this.idleCaption());
    this.render();
  }

  stepOnce(): void {
    this.pause();
    if (!this.fired || this.finishedAll) {
      this.buildLanes();
      this.fired = true;
    }
    this.advance(0.02);
    this.render();
  }

  protected tick(dtReal: number): void {
    if (!this.fired) return;
    this.advance(dtReal * this.speed);
  }

  private advance(ms: number): void {
    const steps = Math.max(1, Math.round(ms / DT));
    for (let s = 0; s < steps; s++) {
      for (const lane of this.lanes) if (!lane.done) lane.axon.step(DT);
      // A lane is done once its spike has finished or failed and things have calmed down.
      for (const lane of this.lanes) {
        if (lane.done) continue;
        const ax = lane.axon;
        const finished = this.stim === 'start' ? !Number.isNaN(ax.finishTime()) : !Number.isNaN(ax.arrival[0]) && !Number.isNaN(ax.arrival[ax.n - 1]);
        if (finished && !lane.announced) {
          lane.announced = true;
          if (soundOn()) click(1 + this.lanes.indexOf(lane) * 0.25);
          this.announce(this.laneSentence(lane), true);
          this.renderResults();
        }
        if ((finished || ax.blocked()) && ax.maxV() < -50) {
          lane.done = true;
          if (!finished && !lane.announced) {
            lane.announced = true;
            this.announce(this.laneSentence(lane), true);
          }
          this.renderResults();
        }
        if (ax.t > 40) lane.done = true;
      }
      if (this.lanes.every((l) => l.done)) {
        this.finishedAll = true;
        this.pause();
        if (!this.pinnedCaption) this.setCaption(this.finishCaption());
        this.renderResults();
        break;
      }
    }
  }

  // ---------- Words ----------

  private idleCaption(): string {
    return this.stim === 'middle'
      ? 'Press Fire: the electrode zaps the middle of each axon at the same moment.'
      : 'Press Fire: an electrode zaps the left end of each axon at the same moment. Which spike reaches the finish first?';
  }

  private runningCaption(): string {
    return 'Each firing patch drives current along the inside of the axon, which brings the next patch to threshold.';
  }

  private finishCaption(): string {
    const results = this.lanes.map((l) => ({ l, t: l.axon.finishTime() }));
    if (this.stim === 'middle') return 'From the middle, each spike spread both ways. In your body, spikes start at the axon hillock, so they only travel one way.';
    const ok = results.filter((r) => !Number.isNaN(r.t)).sort((a, b) => a.t - b.t);
    const blocked = results.filter((r) => Number.isNaN(r.t));
    let s = ok.length ? `${AXONS[ok[0].l.key].short} won in ${fmt(ok[0].t, 2)} ms.` : 'No spike reached the finish.';
    if (blocked.length) s += ` The spike in the ${AXONS[blocked[0].l.key].short} axon died on the way.`;
    return s;
  }

  private laneSentence(lane: Lane): string {
    const ax = lane.axon;
    const name = AXONS[lane.key].label;
    if (this.stim === 'middle') {
      if (!Number.isNaN(ax.arrival[0]) && !Number.isNaN(ax.arrival[ax.n - 1])) return `${name}: reached both ends after ${fmt(ax.arrival[0], 2)} ms.`;
      return `${name}: the spike did not reach both ends.`;
    }
    const t = ax.finishTime();
    if (!Number.isNaN(t)) {
      const v = ax.speed();
      return `${name}: finished in ${fmt(t, 2)} ms${Number.isFinite(v) ? `, ${speedText(v)}` : ''}.`;
    }
    return `${name}: blocked. The spike died at ${fmt(ax.front() / 1000, 1)} mm.`;
  }

  private renderResults(): void {
    const ol = this.root.querySelector('.results');
    if (!ol) return;
    ol.innerHTML = '';
    this.lanes.forEach((lane, i) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = `Lane ${i + 1}, ${AXONS[lane.key].short}:`;
      const sp = document.createElement('span');
      sp.className = `r-lane r-lane-${i}`;
      if (!this.fired) sp.textContent = 'ready';
      else if (lane.announced) sp.textContent = this.laneSentence(lane).replace(/^[^:]+: /, '');
      else sp.textContent = 'running…';
      li.append(b, sp);
      ol.append(li);
    });
  }

  private setCaption(text: string): void {
    const el = this.root.querySelector('.caption');
    if (el && el.textContent !== text) el.textContent = text;
  }

  private async copyLink(): Promise<void> {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    u.searchParams.set('lanes', this.laneKeys.join(','));
    if (this.damage > 0) u.searchParams.set('damage', String(this.damage));
    if (this.stim !== 'start') u.searchParams.set('stim', this.stim);
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

  /** "Which lane wins?", with the answer worked out by running the model ahead. */
  private winnerQuestion(): PredictQuestion {
    let best = 0;
    let bestT = Infinity;
    this.laneKeys.forEach((key, i) => {
      const r = race(AXONS[key], { damage: this.damage / 100 });
      if (!r.blocked && r.finish < bestT) {
        bestT = r.finish;
        best = i;
      }
    });
    const winner = AXONS[this.laneKeys[best]];
    return {
      id: `winner-${this.laneKeys.join('-')}`,
      question: 'All three axons are zapped at the same moment. Which spike will reach the finish first?',
      options: this.laneKeys.map((k, i) => `Lane ${i + 1}: ${AXONS[k].label}`),
      correct: best,
      explain: winner.myelinated
        ? 'Myelin wins. The spike only has to fire at the nodes of Ranvier, and current races along the insulated stretches in between.'
        : 'The fattest axon wins: a wide axon has less resistance inside, so current spreads further ahead of the spike.',
    };
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
      excite: '--excite',
      trace: '--trace',
      grid: '--grid',
      good: '--good',
      bad: '--bad',
      mono: '--font-mono',
    });
  }

  protected render(): void {
    if (!this.canvas) return;
    const pal = this.palette();
    const width = this.canvas.getBoundingClientRect().width || 600;
    const present = this.hasAttribute('present');
    const laneH = Math.max(104, Math.min(150, width * 0.17)) * (present ? 1.15 : 1);
    const want = Math.round(34 + laneH * this.lanes.length + 30);
    if (Math.abs(parseFloat(this.canvas.style.height || '0') - want) > 1) this.canvas.style.height = `${want}px`;
    this.draw(pal, laneH);
    const now = performance.now();
    if (now - this.lastReadout > 80 || !this.playing) {
      this.lastReadout = now;
      const t = this.lanes[0]?.axon.t ?? 0;
      this.$('.r-time').textContent = `${fmt(t, 2)} ms`;
      if (this.playing) this.renderResultsLight();
    }
  }

  /** Update only the running/finished text, without rebuilding the list every frame. */
  private renderResultsLight(): void {
    this.lanes.forEach((lane, i) => {
      const el = this.root.querySelector(`.r-lane-${i}`);
      if (!el) return;
      const text = lane.announced ? this.laneSentence(lane).replace(/^[^:]+: /, '') : 'running…';
      if (el.textContent !== text) el.textContent = text;
    });
  }

  private draw(pal: ReturnType<ConductionElement['palette']>, laneH: number): void {
    const { w: W, h: H } = fitCanvas(this.canvas);
    const ctx = this.canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const present = this.hasAttribute('present');
    const fs = (present ? 1.25 : 1) * (W < 480 ? 10.5 : 11.5);
    const mono = `${Math.round(fs)}px ${pal.mono || 'monospace'}`;
    const bold = `700 ${Math.round(fs * 1.05)}px ${pal.mono || 'monospace'}`;
    const x0 = W < 480 ? 16 : 30;
    const x1 = W - (W < 480 ? 22 : 40);
    const X = (um: number) => x0 + (um / TRACK_UM) * (x1 - x0);
    const top = 30;

    // Header: start electrode label, finish line, time
    ctx.font = mono;
    ctx.fillStyle = pal.faint;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(this.stim === 'middle' ? 'ZAP IN THE MIDDLE' : 'START', x0, 8);
    ctx.textAlign = 'right';
    ctx.fillText(this.stim === 'middle' ? 'END' : 'FINISH', x1 + 6, 8);
    ctx.textAlign = 'center';
    ctx.fillStyle = pal.text;
    ctx.font = bold;
    ctx.fillText(`${fmt(this.lanes[0]?.axon.t ?? 0, 2)} ms`, (x0 + x1) / 2, 7);

    // Finish line (checkered)
    const fy0 = top - 4;
    const fy1 = top + laneH * this.lanes.length - 6;
    const sq = 5;
    for (let y = fy0, k = 0; y < fy1; y += sq, k++) {
      ctx.fillStyle = k % 2 ? pal.text : pal.surface3;
      ctx.fillRect(x1 + 2, y, sq, Math.min(sq, fy1 - y));
      ctx.fillStyle = k % 2 ? pal.surface3 : pal.text;
      ctx.fillRect(x1 + 2 + sq, y, sq, Math.min(sq, fy1 - y));
    }
    if (this.stim === 'middle') {
      ctx.strokeStyle = withAlpha(pal.accent, 0.6);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(X(TRACK_UM / 2), fy0);
      ctx.lineTo(X(TRACK_UM / 2), fy1);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.lanes.forEach((lane, li) => this.drawLane(ctx, lane, li, top + li * laneH, laneH, X, x0, x1, pal, fs));

    // Scale bar
    const yb = H - 16;
    ctx.strokeStyle = pal.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, yb);
    ctx.lineTo(X(1000), yb);
    ctx.moveTo(x0, yb - 4);
    ctx.lineTo(x0, yb + 4);
    ctx.moveTo(X(1000), yb - 4);
    ctx.lineTo(X(1000), yb + 4);
    ctx.stroke();
    ctx.fillStyle = pal.muted;
    ctx.font = mono;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('1 mm', X(1000) + 6, yb);
  }

  private drawLane(
    ctx: CanvasRenderingContext2D,
    lane: Lane,
    li: number,
    y: number,
    h: number,
    X: (um: number) => number,
    x0: number,
    x1: number,
    pal: ReturnType<ConductionElement['palette']>,
    fs: number,
  ): void {
    const ax = lane.axon;
    const spec = AXONS[lane.key];
    const mono = `${Math.round(fs)}px ${pal.mono || 'monospace'}`;
    const label = `${li + 1}. ${spec.label}`;

    // Lane background
    ctx.fillStyle = withAlpha(pal.surface2, li % 2 ? 0.35 : 0.7);
    roundRect(ctx, x0 - 8, y - 2, x1 - x0 + 16, h - 8, 10);
    ctx.fill();

    // Label and result
    ctx.font = `700 ${Math.round(fs)}px ${pal.mono || 'monospace'}`;
    ctx.fillStyle = pal.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const narrow = x1 - x0 < 420;
    ctx.fillText(narrow ? `${li + 1}. ${spec.short}` : label, x0, y + 4);
    ctx.font = mono;
    ctx.textAlign = 'right';
    let res = '';
    let resColor = pal.muted;
    if (this.fired) {
      if (this.stim === 'start') {
        const t = ax.finishTime();
        if (!Number.isNaN(t)) {
          const v = ax.speed();
          res = `${fmt(t, 2)} ms${Number.isFinite(v) ? ` · ${speedText(v, true)}` : ''}`;
          resColor = pal.good;
        } else if (ax.blocked() || lane.done) {
          res = 'blocked';
          resColor = pal.bad;
        }
      } else if (!Number.isNaN(ax.arrival[0]) && !Number.isNaN(ax.arrival[ax.n - 1])) {
        res = `both ends at ${fmt(ax.arrival[0], 2)} ms`;
        resColor = pal.good;
      }
    }
    if (res) {
      ctx.fillStyle = resColor;
      ctx.fillText(res, x1 - 10, y + 4);
    }

    // Voltage profile band
    const bandTop = y + 4 + fs + 8;
    const axonY = y + h - 30;
    const bandBot = axonY - 16;
    const vMin = -80;
    const vMax = 50;
    const VY = (v: number) => bandBot - ((Math.min(vMax, Math.max(vMin, v)) - vMin) / (vMax - vMin)) * (bandBot - bandTop);
    ctx.strokeStyle = pal.grid;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(x0, VY(0));
    ctx.lineTo(x1, VY(0));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pal.faint;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    if (li === 0 && !narrow) ctx.fillText('0 mV', x0 + 2, VY(0) - 1);
    ctx.strokeStyle = pal.trace;
    ctx.lineWidth = 1.75;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < ax.n; i++) {
      const px = X(ax.x[i]);
      const py = VY(ax.V[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // The axon itself: width hints at diameter (not to scale)
    const bodyW = spec.d >= 100 ? 18 : spec.d >= 10 ? 9 : spec.d >= 2 ? 6 : 3.5;
    const sheathW = spec.myelinated ? bodyW + 10 : bodyW;
    // Membrane coloured by voltage
    for (let i = 0; i < ax.n; i++) {
      const xa = i === 0 ? X(0) : (X(ax.x[i - 1]) + X(ax.x[i])) / 2;
      const xb = i === ax.n - 1 ? X(ax.length) : (X(ax.x[i]) + X(ax.x[i + 1])) / 2;
      const s = Math.min(1, Math.max(0, (ax.V[i] + 60) / 80));
      ctx.fillStyle = s > 0.02 ? mix(pal.membrane, pal.excite, s) : pal.membrane;
      // Snap to whole pixels so neighbouring compartments join without seams.
      const ra = Math.floor(xa);
      ctx.fillRect(ra, axonY - bodyW / 2, Math.max(1, Math.ceil(xb) - ra), bodyW);
    }
    // Myelin sheaths over the internodes
    if (spec.myelinated) {
      const L = MYELIN.internodePerD * spec.d;
      const gapPx = Math.max(2, (MYELIN.nodeLength / TRACK_UM) * (x1 - x0) + 2);
      for (let start = MYELIN.nodeLength; start < ax.length; start += L + MYELIN.nodeLength) {
        const end = Math.min(ax.length, start + L);
        const xa = X(start) + gapPx / 2;
        const xb = X(end) - gapPx / 2;
        if (xb <= xa) continue;
        const mid = (start + end) / 2 / ax.length;
        const damaged = !!spec.damaged && mid >= 0.35 && mid <= 0.65;
        const keep = damaged ? 1 - this.damage / 100 : 1;
        if (keep <= 0.02) {
          // Bare membrane where the myelin was: a dashed outline
          ctx.strokeStyle = withAlpha(pal.bad, 0.8);
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          roundRect(ctx, xa, axonY - sheathW / 2, xb - xa, sheathW, sheathW / 2);
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        const sw = bodyW + (sheathW - bodyW) * keep;
        ctx.fillStyle = withAlpha(pal.surface3, 0.55 + 0.4 * keep);
        ctx.strokeStyle = damaged ? withAlpha(pal.bad, 0.9) : withAlpha(pal.text, 0.55);
        ctx.lineWidth = 1;
        roundRect(ctx, xa, axonY - sw / 2, xb - xa, sw, sw / 2);
        ctx.fill();
        ctx.stroke();
      }
      if (spec.damaged) {
        ctx.fillStyle = pal.bad;
        ctx.font = mono;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(this.damage > 0 ? `${Math.round(this.damage)}% of the myelin lost here` : 'myelin can be damaged here', X(ax.length / 2), axonY + sheathW / 2 + 3);
      }
    }

    // Spike front marker
    if (this.fired) {
      const f = ax.front();
      if (f >= 0 && !lane.done) {
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        const fx = X(f);
        ctx.moveTo(fx, axonY - sheathW / 2 - 4);
        ctx.lineTo(fx - 5, axonY - sheathW / 2 - 12);
        ctx.lineTo(fx + 5, axonY - sheathW / 2 - 12);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Electrode
    const ex = this.stim === 'middle' ? X(ax.length / 2) : X(150);
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex, axonY + sheathW / 2 + 16);
    ctx.lineTo(ex, axonY + sheathW / 2 + 2);
    ctx.stroke();
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(ex, axonY + sheathW / 2 + 17, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function speedText(v: number, short = false): string {
  const digits = v < 10 ? 1 : 0;
  return short ? `${v.toFixed(digits)} m/s` : `${v.toFixed(digits)} metres per second`;
}

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return t > 0.5 ? b : a;
  const c = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function parse(c: string): number[] | null {
  const s = c.trim();
  if (s.startsWith('#')) {
    const hex = s.length === 4 ? s.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : s;
    const n = parseInt(hex.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(',').slice(0, 3).map((x) => parseFloat(x)) : null;
}

if (!customElements.get('nc-conduction')) customElements.define('nc-conduction', ConductionElement);
