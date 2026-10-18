import { SimElement, fmt, type PredictQuestion } from '../shared/sim-element';
import { drawIon, fitCanvas, readPalette, rng, roundRect, withAlpha } from '../shared/canvas';
import {
  C,
  DRUGS,
  EXAMPLES,
  STAGES,
  SYNAPSES,
  Synapse,
  caInf,
  drugEffect,
  type DrugId,
  type SynEvent,
  type SynapseType,
  type TransmitterId,
} from './model';

/**
 * <nc-synapse>: one chemical synapse, from the spike arriving to the clean-up, with a drug bench.
 *
 * Attributes: preset, transmitter (glutamate | gaba | ach | serotonin), drug, speed, predict,
 * present, lab-href.
 */

type SpeedMode = 'auto' | number;

interface Sample {
  t: number;
  vPre: number;
  ca: number;
  cleft: number;
  cleftCtrl: number;
  v: number;
  vCtrl: number;
}

interface Molecule {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 'free' drifts in the cleft; 'leaving' heads for a clearance site and fades */
  state: 'free' | 'leaving';
  tx: number;
  ty: number;
  life: number;
  how: 'uptake' | 'enzyme' | 'diffuse';
}

interface Fusion {
  slot: number;
  age: number;
}

interface Ion {
  kind: 'na' | 'k' | 'cl' | 'ca';
  x: number;
  y0: number;
  y1: number;
  p: number;
  jitter: number;
}

interface Preset {
  transmitter?: TransmitterId;
  drug?: DrugId;
  action?: 'none' | 'spike' | 'burst' | 'step';
  caption?: string;
}

export const SYNAPSE_PRESETS: Record<string, Preset> = {
  idle: { action: 'none' },
  play: { action: 'spike' },
  step: { action: 'step' },
  gaba: { transmitter: 'gaba', action: 'spike' },
  ach: { transmitter: 'ach', action: 'spike' },
  metabotropic: { transmitter: 'serotonin', action: 'spike' },
  burst: { action: 'burst' },
  bench: { transmitter: 'ach', action: 'none', caption: 'Choose a drug, predict what it will do, then send a spike. The dashed lines show the same synapse without the drug.' },
  nicotine: { transmitter: 'ach', drug: 'agonist', action: 'spike' },
  curare: { transmitter: 'ach', drug: 'antagonist', action: 'spike' },
  'nerve-agent': { transmitter: 'ach', drug: 'enzyme', action: 'spike' },
  botox: { transmitter: 'ach', drug: 'release-block', action: 'spike' },
  'black-widow': { transmitter: 'ach', drug: 'release-boost', action: 'spike' },
  'ach-reuptake': { transmitter: 'ach', drug: 'reuptake', action: 'spike' },
  ssri: { transmitter: 'serotonin', drug: 'reuptake', action: 'spike' },
  maoi: { transmitter: 'serotonin', drug: 'enzyme', action: 'spike' },
  mdma: { transmitter: 'serotonin', drug: 'release-boost', action: 'spike' },
  tiagabine: { transmitter: 'gaba', drug: 'reuptake', action: 'spike' },
  muscimol: { transmitter: 'gaba', drug: 'agonist', action: 'spike' },
};

const SPEEDS: SpeedMode[] = ['auto', 0.5, 5, 50];
const STAGE_SHORT: Record<SynEvent, string> = {
  arrival: 'Spike arrives',
  'ca-open': 'Ca²⁺ channels open',
  'ca-in': 'Ca²⁺ flows in',
  fusion: 'Vesicles fuse',
  binding: 'Transmitter binds',
  channels: 'Channels open: PSP',
  cleared: 'Transmitter cleared',
  'psp-peak': 'PSP peaks and fades',
  recycled: 'Vesicles recycled',
};

const TYPE_LABEL: Record<TransmitterId, { title: string; sub: string }> = {
  glutamate: { title: 'Glutamate', sub: 'AMPA receptor · excitatory · fast' },
  gaba: { title: 'GABA', sub: 'GABA-A receptor · inhibitory · fast' },
  ach: { title: 'Acetylcholine', sub: 'Nicotinic receptor · excitatory · fast' },
  serotonin: { title: 'Serotonin', sub: '5-HT1A receptor · inhibitory · slow (metabotropic)' },
};

function clearanceText(T: SynapseType): string {
  switch (T.id) {
    case 'glutamate':
      return 'Transporters on the terminal and on a nearby astrocyte pump glutamate back out of the cleft (reuptake). Some drifts away.';
    case 'gaba':
      return 'Transporters on the terminal and on a nearby astrocyte pump GABA back out of the cleft (reuptake).';
    case 'ach':
      return 'The enzyme acetylcholinesterase splits acetylcholine into choline and acetate within a fraction of a millisecond. The terminal takes the choline back to make new acetylcholine.';
    default:
      return 'Serotonin transporters pump it back into the terminal (reuptake). There it is packed into vesicles again or broken down by the enzyme MAO.';
  }
}

function narration(stage: SynEvent, T: SynapseType): string {
  const ionWord = T.ion === 'na' ? 'Na⁺ flows in' : T.ion === 'cl' ? 'Cl⁻ flows in' : 'K⁺ flows out';
  const psp = T.effect === 'excitatory' ? 'an excitatory postsynaptic potential (EPSP): the membrane depolarises' : 'an inhibitory postsynaptic potential (IPSP): the membrane hyperpolarises';
  switch (stage) {
    case 'arrival':
      return 'Step 1. An action potential arrives at the terminal button and depolarises its membrane.';
    case 'ca-open':
      return 'Step 2. The depolarisation opens voltage-gated calcium channels in the active zone, next to the docked vesicles.';
    case 'ca-in':
      return 'Step 3. Ca²⁺ rushes in. There is about 10,000 times more calcium outside the cell than inside, so even a brief opening makes a big local spike in calcium.';
    case 'fusion':
      return `Step 4. Calcium triggers docked vesicles to fuse with the membrane and spill their ${lowerName(T.name)} into the cleft (exocytosis). Only some of the docked vesicles fuse.`;
    case 'binding':
      return `Step 5. ${T.name} crosses the narrow cleft in microseconds and binds to its receptors on the postsynaptic membrane.`;
    case 'channels':
      return T.receptor === 'ionotropic'
        ? `Step 6. The receptors are ion channels themselves (ionotropic), so they open at once: ${ionWord}. This is ${psp}.`
        : `Step 6. The receptor is not a channel (metabotropic). It switches on a G protein inside the cell, which then opens separate K⁺ channels. That relay is slow: ${ionWord}, making a slow IPSP.`;
    case 'cleared':
      return `Step 7. The cleft is cleared. ${clearanceText(T)}`;
    case 'psp-peak':
      return 'Step 8. The postsynaptic potential peaks and fades as the channels close and charge leaks away. It outlasts the transmitter itself.';
    case 'recycled':
      return 'Step 9. The vesicle membrane is pulled back in, refilled with transmitter and docked again, ready for the next spike.';
  }
}

/** "Glutamate" becomes "glutamate", but "GABA" stays "GABA". */
function lowerName(name: string): string {
  return name === name.toUpperCase() ? name : name.toLowerCase();
}

/** "a glutamate synapse", "an acetylcholine synapse" */
function aSynapse(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${lowerName(name)} synapse`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class SynapseElement extends SimElement {
  private syn = new Synapse('glutamate');
  private ctrl = new Synapse('glutamate');
  private transmitter: TransmitterId = 'glutamate';
  private drug: DrugId = 'none';
  private speedMode: SpeedMode = 'auto';
  private speedNow = 0.5;
  private samples: Sample[] = [];
  private lastSampleT = -Infinity;
  private spikeTimes: number[] = [];
  private seen = new Set<SynEvent>();
  private stageNow: SynEvent | null = null;
  private queued: SynEvent[] = [];
  private releasedAtFire = 0;
  private lastReleased = 0;
  private peakDv = 0;
  private peakDvCtrl = 0;
  private hasFired = false;
  private pinnedCaption: string | null = null;
  private clock = 0;
  private lastReadout = 0;
  private visReleased = 0;
  private visDocked = C.docked;
  private fusions: Fusion[] = [];
  private molecules: Molecule[] = [];
  private ions: Ion[] = [];
  private spawnCa = 0;
  private spawnIon = 0;
  private lastFusionX = 0.5;
  private lastFusionAge = 99;

  private scene!: HTMLCanvasElement;
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
        .stages { list-style: none; display: flex; flex-wrap: wrap; gap: 0.3rem; padding: 0; margin: 0 0 var(--sim-gap); counter-reset: st; }
        .stages li { font-size: 0.78em; padding: 0.2rem 0.55rem 0.2rem 0.4rem; border-radius: 999px; border: 1px solid var(--border); color: var(--text-faint); display: inline-flex; align-items: center; gap: 0.35em; }
        .stages li .n { font-family: var(--font-mono); font-size: 0.9em; display: inline-grid; place-items: center; width: 1.45em; height: 1.45em; border-radius: 50%; background: var(--surface-2); color: var(--text-muted); }
        .stages li.done { color: var(--text-muted); border-color: var(--border-strong); }
        .stages li.done .n { background: var(--accent-soft); color: var(--text); }
        .stages li.now { color: var(--text); border-color: var(--accent); background: var(--accent-soft); font-weight: 700; }
        .stages li.now .n { background: var(--accent); color: var(--accent-ink); }
        .choice { display: grid; gap: 0.15rem; }
        .choice label { display: flex; gap: 0.55rem; align-items: flex-start; padding: 0.3rem 0.35rem; border-radius: var(--radius-s); cursor: pointer; }
        .choice label:hover { background: var(--surface-2); }
        .choice input { margin-top: 0.3rem; accent-color: var(--accent); flex: none; width: 1.05rem; height: 1.05rem; }
        .choice small { display: block; color: var(--text-muted); font-size: 0.85em; }
        .choice small.none { color: var(--bad); }
        .drug-note { margin: 0.5rem 0 0; font-size: 0.88em; padding: 0.45rem 0.6rem; border-radius: var(--radius-s); background: var(--surface-2); border-left: 3px solid var(--warn); }
        .drug-note[hidden] { display: none; }
        .syn-controls { grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); align-items: start; }
        .syn-controls .stack { display: grid; gap: var(--sim-gap); min-width: 0; }
        @container (min-width: 760px) {
          canvas.scene { aspect-ratio: 1 / 0.96 !important; }
        }
        @container (max-width: 479px) {
          canvas.trace { aspect-ratio: 1 / 1.05 !important; }
        }
      </style>
      <div class="sim" part="sim">
        <div class="head">
          <div class="title">Synapse in motion<small class="subtitle">One chemical synapse, slowed down</small></div>
          <div class="transport">
            <button class="play primary" type="button" aria-label="Play"><span aria-hidden="true">▶</span> <span class="lbl">Play</span></button>
            <button class="next" type="button" aria-label="Next step" title="Go to the next step"><span aria-hidden="true">⏭</span> Next step</button>
            <button class="reset" type="button" aria-label="Reset" title="Reset">↺</button>
            <label class="visually-hidden" for="speed">Speed</label>
            <select id="speed" class="speed" aria-label="Speed">
              <option value="auto">Auto slow motion</option>
              <option value="0.5">0.5 ms per second</option>
              <option value="5">5 ms per second</option>
              <option value="50">50 ms per second</option>
            </select>
            <span class="timescale"></span>
          </div>
        </div>
        <p class="caption" aria-live="off"></p>
        <ol class="stages" aria-label="The steps of synaptic transmission">
          ${STAGES.map((s, i) => `<li data-stage="${s.id}"><span class="n" aria-hidden="true">${i + 1}</span>${STAGE_SHORT[s.id]}</li>`).join('')}
        </ol>
        <div class="views two">
          <figure>
            <canvas class="scene" style="aspect-ratio: 1 / 0.86" role="img" aria-label="Animated synapse: presynaptic terminal with vesicles, the cleft, and the postsynaptic membrane with receptors"></canvas>
            <figcaption><span class="legend legend-scene"></span></figcaption>
          </figure>
          <figure>
            <canvas class="trace" style="aspect-ratio: 16 / 13" role="img" aria-label="Traces: terminal voltage and calcium, transmitter in the cleft, and the postsynaptic potential"></canvas>
            <figcaption>
              <span class="legend">
                <span><i class="line" style="background: var(--trace)"></i>With the settings chosen</span>
                <span class="ctrl-key" hidden><i class="line" style="background: var(--text-faint)"></i>Dashed: same synapse, no drug</span>
              </span>
            </figcaption>
          </figure>
        </div>
        <div class="readouts" role="group" aria-label="Readouts">
          <span><b>Released by last spike</b><span class="r-rel">—</span></span>
          <span><b>Docked and ready</b><span class="r-docked"></span></span>
          <span><b>PSP peak</b><span class="r-psp">—</span></span>
          <span class="r-ctrl-wrap" hidden><b>Without the drug</b><span class="r-ctrl">—</span></span>
        </div>
        <div class="controls syn-controls">
          <div class="stack">
          <fieldset>
            <legend>Stimulate</legend>
            <div class="row">
              <button class="spike primary" type="button"><span aria-hidden="true">⚡</span> Send a spike</button>
              <button class="burst" type="button">Burst of 5</button>
            </div>
            <p class="note">A burst sends five spikes, 20 milliseconds apart.</p>
            <label class="toggle"><input type="checkbox" class="predict" /><span>Predict, then watch<small>Pause at key moments and ask what comes next</small></span></label>
          </fieldset>
          <fieldset>
            <legend>Synapse</legend>
            <div class="choice tx-choice" role="radiogroup" aria-label="Transmitter">
              ${(Object.keys(TYPE_LABEL) as TransmitterId[])
                .map((id) => `<label><input type="radio" name="tx" value="${id}" /><span>${TYPE_LABEL[id].title}<small>${TYPE_LABEL[id].sub}</small></span></label>`)
                .join('')}
            </div>
          </fieldset>
          </div>
          <fieldset>
            <legend>Drug bench</legend>
            <div class="choice drug-choice" role="radiogroup" aria-label="Drug">
              ${DRUGS.map((d) => `<label><input type="radio" name="drug" value="${d.id}" /><span>${d.label}<small class="ex" data-drug="${d.id}"></small></span></label>`).join('')}
            </div>
            <p class="drug-note" hidden></p>
          </fieldset>
        </div>
        <div class="row">
          <button class="png" type="button">Save PNG</button>
          <button class="link" type="button">Copy link</button>
        </div>
        <p class="keys">Keys: <kbd>Space</kbd> play or pause · <kbd>Z</kbd> send a spike · <kbd>N</kbd> next step · <kbd>B</kbd> burst · <kbd>R</kbd> reset</p>
      </div>`);

    this.scene = this.$('.scene') as HTMLCanvasElement;
    this.trace = this.$('.trace') as HTMLCanvasElement;

    const attr = (n: string) => this.getAttribute(n);
    const preset = attr('preset') ?? 'idle';
    const tx = attr('transmitter');
    const drug = attr('drug');
    const p = SYNAPSE_PRESETS[preset] ?? SYNAPSE_PRESETS.idle;
    this.transmitter = tx && tx in SYNAPSES ? (tx as TransmitterId) : (p.transmitter ?? 'glutamate');
    this.drug = drug && DRUGS.some((d) => d.id === drug) ? (drug as DrugId) : (p.drug ?? 'none');
    const sp = attr('speed');
    if (sp && SPEEDS.map(String).includes(sp)) this.speedMode = sp === 'auto' ? 'auto' : Number(sp);
    this.applyModels();
    this.wire();
    this.syncControls();
    this.pinnedCaption = p.caption ?? null;
    // Start any action from the preset once the element is on screen.
    if (p.action && p.action !== 'none' && !tx && !drug) requestAnimationFrame(() => this.runAction(p.action!));
    else this.setCaption(this.pinnedCaption ?? this.idleCaption());
  }

  /** Apply a named preset, e.g. from a "Try this" button in a lesson. */
  applyPreset(name: string, start = true): void {
    const p = SYNAPSE_PRESETS[name] ?? SYNAPSE_PRESETS.idle;
    this.transmitter = p.transmitter ?? 'glutamate';
    this.drug = p.drug ?? 'none';
    this.speedMode = 'auto';
    this.applyModels();
    if (!this.scene) return;
    this.syncControls();
    this.pinnedCaption = p.caption ?? null;
    this.setCaption(this.pinnedCaption ?? this.idleCaption());
    if (start && p.action && p.action !== 'none') this.runAction(p.action);
    this.render();
  }

  private runAction(action: NonNullable<Preset['action']>) {
    if (action === 'spike') void this.sendSpike();
    else if (action === 'burst') void this.sendBurst();
    else if (action === 'step') void this.nextStep();
  }

  private idleCaption(): string {
    const T = SYNAPSES[this.transmitter];
    if (this.drug !== 'none') return this.drugNote();
    return `${cap(aSynapse(T.name))} at rest. Press Send a spike to watch it work, or Next step to go through it one step at a time.`;
  }

  private drugNote(): string {
    const info = DRUGS.find((d) => d.id === this.drug)!;
    if (this.drug === 'none') return '';
    const ex = EXAMPLES[this.transmitter][this.drug as Exclude<DrugId, 'none'>];
    const eff = drugEffect(this.drug, SYNAPSES[this.transmitter]);
    return eff.hasTarget ? `${info.label}: ${info.does} Example here: ${ex}.` : `${info.label}: ${ex}, so this drug changes nothing at this synapse.`;
  }

  /** Rebuild both models for the current transmitter and drug. */
  private applyModels() {
    this.syn = new Synapse(this.transmitter, this.drug);
    this.ctrl = new Synapse(this.transmitter, 'none');
    this.resetState();
  }

  private resetState() {
    this.syn.reset();
    this.ctrl.reset();
    this.samples = [];
    this.lastSampleT = -Infinity;
    this.spikeTimes = [];
    this.seen.clear();
    this.stageNow = null;
    this.queued = [];
    this.releasedAtFire = 0;
    this.lastReleased = 0;
    this.peakDv = 0;
    this.peakDvCtrl = 0;
    this.hasFired = false;
    this.visReleased = 0;
    this.visDocked = C.docked;
    this.fusions = [];
    this.molecules = [];
    this.ions = [];
    this.record(true);
    this.syncMolecules(true);
  }

  private syncControls() {
    const radios = (name: string) => [...this.root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)];
    radios('tx').forEach((r) => (r.checked = r.value === this.transmitter));
    radios('drug').forEach((r) => (r.checked = r.value === this.drug));
    (this.$('.predict') as HTMLInputElement).checked = this.predictEnabled;
    (this.$('.speed') as HTMLSelectElement).value = String(this.speedMode);
    const T = SYNAPSES[this.transmitter];
    this.root.querySelectorAll<HTMLElement>('small.ex').forEach((el) => {
      const d = el.dataset.drug as DrugId;
      if (d === 'none') {
        el.textContent = 'The synapse working normally';
        el.classList.remove('none');
        return;
      }
      const has = drugEffect(d, T).hasTarget;
      el.textContent = EXAMPLES[this.transmitter][d as Exclude<DrugId, 'none'>];
      el.classList.toggle('none', !has);
    });
    const note = this.$('.drug-note');
    note.hidden = this.drug === 'none';
    note.textContent = this.drugNote();
    (this.$('.ctrl-key') as HTMLElement).hidden = this.drug === 'none';
    (this.$('.r-ctrl-wrap') as HTMLElement).hidden = this.drug === 'none';
    const ionLegend: Record<string, string> = {
      na: '<span><i class="round" style="background: var(--ion-na)"></i>Na⁺ (circles)</span>',
      cl: '<span><i style="background: var(--ion-cl); clip-path: polygon(50% 0, 100% 100%, 0 100%)"></i>Cl⁻ (triangles)</span>',
      k: '<span><i style="background: var(--ion-k)"></i>K⁺ (squares)</span>',
    };
    this.$('.legend-scene').innerHTML = `
      <span><i style="background: var(--ion-ca); clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"></i>Ca²⁺ (diamonds)</span>
      ${ionLegend[T.ion]}
      <span><i class="round" style="background: var(--accent)"></i>${T.name} (small dots)</span>`;
    this.$('.subtitle').textContent = `${cap(aSynapse(T.name))} with ${/^A/.test(T.receptorName) ? 'an' : 'a'} ${T.receptorName}`;
    this.updateTimescale();
  }

  private wire() {
    const on = (sel: string, ev: string, fn: (e: Event) => void) => this.$(sel).addEventListener(ev, fn);
    on('.play', 'click', () => this.toggle());
    on('.next', 'click', () => void this.nextStep());
    on('.reset', 'click', () => {
      this.pause();
      this.resetState();
      this.pinnedCaption = null;
      this.setCaption(this.idleCaption());
      this.render();
    });
    on('.speed', 'change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      this.speedMode = v === 'auto' ? 'auto' : Number(v);
      this.updateTimescale();
    });
    on('.spike', 'click', () => void this.sendSpike());
    on('.burst', 'click', () => void this.sendBurst());
    on('.predict', 'change', (e) => {
      this.predictEnabled = (e.target as HTMLInputElement).checked;
    });
    this.root.querySelectorAll<HTMLInputElement>('input[name="tx"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.transmitter = r.value as TransmitterId;
        this.pause();
        this.applyModels();
        this.syncControls();
        this.pinnedCaption = null;
        this.setCaption(this.idleCaption());
        this.announce(`${SYNAPSES[this.transmitter].name} synapse`, true);
        this.render();
      }),
    );
    this.root.querySelectorAll<HTMLInputElement>('input[name="drug"]').forEach((r) =>
      r.addEventListener('change', () => {
        if (!r.checked) return;
        this.drug = r.value as DrugId;
        this.pause();
        this.applyModels();
        this.syncControls();
        this.pinnedCaption = null;
        this.setCaption(this.idleCaption());
        this.announce(this.drug === 'none' ? 'Drug washed out' : `${DRUGS.find((d) => d.id === this.drug)!.label} added`, true);
        this.render();
      }),
    );
    on('.png', 'click', () => this.savePng([this.scene, this.trace], 'Synapse in motion', 'synapse.png'));
    on('.link', 'click', () => void this.copyLink());
    this.addEventListener('keydown', (e) => {
      const target = e.composedPath()[0] as HTMLElement;
      const tag = target?.tagName;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === ' ' && tag !== 'BUTTON' && tag !== 'SELECT' && tag !== 'INPUT') {
        e.preventDefault();
        this.toggle();
      } else if ((e.key === 'z' || e.key === 'Z') && tag !== 'SELECT') {
        void this.sendSpike();
      } else if ((e.key === 'n' || e.key === 'N') && tag !== 'SELECT') {
        void this.nextStep();
      } else if ((e.key === 'b' || e.key === 'B') && tag !== 'SELECT') {
        void this.sendBurst();
      } else if (e.key === 'r' || e.key === 'R') {
        this.pause();
        this.resetState();
        this.setCaption(this.idleCaption());
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

  private async copyLink() {
    const href = this.getAttribute('lab-href') ?? location.pathname;
    const u = new URL(href, location.href);
    u.search = '';
    u.searchParams.set('transmitter', this.transmitter);
    if (this.drug !== 'none') u.searchParams.set('drug', this.drug);
    if (this.speedMode !== 'auto') u.searchParams.set('speed', String(this.speedMode));
    const btn = this.$('.link');
    try {
      await navigator.clipboard.writeText(u.toString());
      btn.textContent = 'Link copied';
    } catch {
      prompt('Copy this link:', u.toString());
    }
    setTimeout(() => (btn.textContent = 'Copy link'), 2000);
  }

  // ---------- Predict questions ----------

  private async askBeforeSpike() {
    if (!this.predictEnabled) return;
    if (this.drug !== 'none') {
      await this.ask(this.drugQuestion());
      return;
    }
    if (this.transmitter === 'gaba') {
      await this.ask({
        id: 'gaba',
        question: 'GABA opens chloride channels. Chloride’s equilibrium potential here is −80 mV, below rest. What will the postsynaptic membrane do?',
        options: ['Depolarise a little (an EPSP).', 'Hyperpolarise a little (an IPSP).', 'Fire an action potential.'],
        correct: 1,
        explain: 'Cl⁻ flows in and pulls the membrane towards −80 mV, slightly more negative than rest. That makes the cell harder to fire: an IPSP.',
      });
    }
  }

  /** Work out the answer by running the drugged and the control synapse ahead. */
  private drugQuestion(): PredictQuestion {
    const run = (drug: DrugId) => {
      const s = new Synapse(this.transmitter, drug);
      s.reset();
      const base = s.baseline();
      s.fire(1);
      let area = 0;
      const end = SYNAPSES[this.transmitter].window * 1.5;
      while (s.s.t < end) {
        s.advance(0.1);
        area += Math.abs(s.s.v - base) * 0.1;
      }
      return area;
    };
    const a = run(this.drug);
    const b = run('none');
    const ratio = a / Math.max(1e-6, b);
    const correct = ratio > 1.2 ? 0 : ratio < 0.8 ? 1 : 2;
    const info = DRUGS.find((d) => d.id === this.drug)!;
    const has = drugEffect(this.drug, SYNAPSES[this.transmitter]).hasTarget;
    const explain = !has
      ? `${EXAMPLES[this.transmitter][this.drug as Exclude<DrugId, 'none'>]}, so the drug has no target here and the PSP is unchanged.`
      : [
          'The drug strengthens the signal: the postsynaptic potential is bigger or lasts longer than without it.',
          'The drug weakens the signal: the postsynaptic potential is smaller than without it.',
          'The drug barely changes this PSP.',
        ][correct];
    return {
      id: `drug-${this.transmitter}-${this.drug}`,
      question: `${info.label} at ${aSynapse(SYNAPSES[this.transmitter].name)}. Compared with no drug, the postsynaptic potential will be…`,
      options: ['Bigger or longer.', 'Smaller.', 'About the same.'],
      correct,
      explain,
    };
  }

  // ---------- Stimulation ----------

  private async sendSpike() {
    await this.askBeforeSpike();
    this.fireAt(this.syn.s.t + 0.3);
    this.pinnedCaption = null;
    this.announce('Spike sent', true);
    if (!this.playing) this.play();
  }

  private async sendBurst() {
    await this.askBeforeSpike();
    for (let i = 0; i < 5; i++) this.fireAt(this.syn.s.t + 0.3 + i * 20);
    this.pinnedCaption = null;
    this.announce('Burst of five spikes sent', true);
    if (!this.playing) this.play();
  }

  private fireAt(t: number) {
    this.syn.fire(t);
    this.ctrl.fire(t);
    this.spikeTimes.push(t);
    this.hasFired = true;
    this.seen.clear();
    this.stageNow = null;
    this.queued = [];
    this.releasedAtFire = this.syn.s.released;
    this.peakDv = 0;
    this.peakDvCtrl = 0;
    this.updateStages();
  }

  /** Go to the next step of transmission, firing a spike first if none is under way. */
  private async nextStep() {
    this.pause();
    this.pinnedCaption = null;
    if (this.queued.length) {
      this.enterStage(this.queued.shift()!);
      this.render();
      return;
    }
    if (!this.syn.tracking()) {
      await this.askBeforeSpike();
      this.fireAt(this.syn.s.t + 0.3);
    }
    const end = this.syn.s.t + 1500;
    let events: SynEvent[] = [];
    while (this.syn.s.t < end && events.length === 0) events = this.advanceModels(0.02);
    if (events.length) {
      this.enterStage(events[0]);
      this.queued = events.slice(1);
    }
    this.syncMolecules(true);
    this.render();
  }

  private enterStage(e: SynEvent) {
    this.stageNow = e;
    this.seen.add(e);
    this.setCaption(narration(e, SYNAPSES[this.transmitter]));
    this.announce(narration(e, SYNAPSES[this.transmitter]), true);
    this.updateStages();
    if (e === 'arrival' && this.predictEnabled && this.drug === 'none') {
      void this.ask({
        id: 'calcium',
        question: 'The spike has reached the terminal. What makes the vesicles release their transmitter?',
        options: ['Sodium ions entering the terminal.', 'Calcium ions entering the terminal.', 'The voltage pushing the vesicles out.'],
        correct: 1,
        explain: 'The depolarisation opens voltage-gated calcium channels. Ca²⁺ flows in, and calcium is the trigger that makes docked vesicles fuse with the membrane.',
      });
    }
  }

  private updateStages() {
    this.root.querySelectorAll<HTMLElement>('.stages li').forEach((li) => {
      const id = li.dataset.stage as SynEvent;
      li.classList.toggle('done', this.seen.has(id) && id !== this.stageNow);
      li.classList.toggle('now', id === this.stageNow);
      if (id === this.stageNow) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  // ---------- Time ----------

  reset(): void {
    this.resetState();
  }

  stepOnce(): void {
    void this.nextStep();
  }

  private targetSpeed(): number {
    if (this.speedMode !== 'auto') return this.speedMode;
    const s = this.syn.s;
    const T = SYNAPSES[this.transmitter];
    const pending = this.spikeTimes.filter((t) => t > s.t - 3).length;
    if (pending > 1) return 5;
    const presyn = this.spikeTimes.some((t) => s.t - t > -0.5 && s.t - t < 3) || s.ca > 0.08;
    if (presyn) return 0.5;
    if (s.cleft - this.syn.steadyCleft() > 0.08 && T.receptor === 'ionotropic') return 1.2;
    if (this.syn.active()) return T.receptor === 'metabotropic' ? 60 : 8;
    return T.receptor === 'metabotropic' ? 150 : 80;
  }

  private updateTimescale() {
    const sp = this.speedMode === 'auto' ? this.speedNow : this.speedMode;
    const slow = Math.round(1000 / sp);
    this.$('.timescale').textContent = slow >= 2 ? `Slowed ${slow.toLocaleString('en-GB')}×` : 'Real time';
  }

  protected tick(dtReal: number): void {
    this.clock += dtReal;
    const target = this.targetSpeed();
    // Ease between speeds so slow motion starts and ends smoothly.
    const k = 1 - Math.exp(-dtReal * 5);
    this.speedNow = Math.exp(Math.log(this.speedNow) + (Math.log(target) - Math.log(this.speedNow)) * k);
    if (target < this.speedNow && target <= 1.2) this.speedNow = Math.max(target, Math.min(this.speedNow, target * 3));
    const ms = Math.min(dtReal * this.speedNow, 40);
    const events = this.advanceModels(ms);
    for (const e of events) this.enterStage(e);
    this.updateVisuals(dtReal);
    if (Math.round(this.clock * 4) !== Math.round((this.clock - dtReal) * 4)) this.updateTimescale();
  }

  /** Advance both synapses by `ms` in small slices, recording traces. Returns new events. */
  private advanceModels(ms: number): SynEvent[] {
    const slice = Math.min(0.05, ms);
    const n = Math.max(1, Math.round(ms / slice));
    const out: SynEvent[] = [];
    for (let i = 0; i < n; i++) {
      out.push(...this.syn.advance(ms / n));
      this.ctrl.advance(ms / n);
      const dv = this.syn.s.v - this.syn.baseline();
      if (Math.abs(dv) > Math.abs(this.peakDv)) this.peakDv = dv;
      const dvc = this.ctrl.s.v - this.ctrl.baseline();
      if (Math.abs(dvc) > Math.abs(this.peakDvCtrl)) this.peakDvCtrl = dvc;
      this.lastReleased = this.syn.s.released - this.releasedAtFire;
      this.record();
    }
    return out;
  }

  private record(force = false) {
    const T = SYNAPSES[this.transmitter];
    const every = T.window / 500;
    const s = this.syn.s;
    if (!force && s.t - this.lastSampleT < every) return;
    this.samples.push({ t: s.t, vPre: s.vPre, ca: s.ca, cleft: s.cleft, cleftCtrl: this.ctrl.s.cleft, v: s.v, vCtrl: this.ctrl.s.v });
    this.lastSampleT = s.t;
    const cutoff = s.t - T.window - 2;
    let drop = 0;
    while (drop < this.samples.length && this.samples[drop].t < cutoff) drop++;
    if (drop) this.samples.splice(0, drop);
  }

  // ---------- Geometry ----------

  private geom(W: number, H: number) {
    const yPre = H * 0.42;
    const yPost = H * 0.6;
    const r = Math.max(6, Math.min(12, W * 0.024));
    const slots = Array.from({ length: C.docked }, (_, i) => W * (0.29 + (0.42 * (i + 0.5)) / C.docked));
    const caX = [W * 0.395, W * 0.5, W * 0.605];
    const recX = SYNAPSES[this.transmitter].receptor === 'ionotropic' ? [0.33, 0.45, 0.57, 0.69].map((f) => f * W) : [0.37, 0.63].map((f) => f * W);
    const kX = [0.22, 0.78].map((f) => f * W);
    const transX = [W * 0.17, W * 0.83];
    const autoX = W * 0.25;
    const enzX = [0.27, 0.51, 0.75].map((f) => f * W);
    return { yPre, yPost, r, slots, caX, recX, kX, transX, autoX, enzX };
  }

  /** Order in which docked slots empty and fill: centre first. */
  private slotOrder(): number[] {
    const n = C.docked;
    return Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2));
  }

  // ---------- Visual particles ----------

  private updateVisuals(dt: number) {
    const s = this.syn.s;
    const { w: W, h: H } = { w: this.scene.clientWidth || 400, h: this.scene.clientHeight || 340 };
    const g = this.geom(W, H);
    // Vesicle fusions: one animation per whole vesicle released.
    const relWhole = Math.floor(s.released + 0.35);
    const order = this.slotOrder();
    while (this.visReleased < relWhole) {
      const docked = Math.max(1, Math.round(this.visDocked));
      const slot = order[Math.min(order.length - 1, docked - 1)];
      this.fusions.push({ slot, age: 0 });
      this.visReleased++;
      this.visDocked = Math.max(0, this.visDocked - 1);
      this.lastFusionX = g.slots[slot] / W;
      this.lastFusionAge = 0;
      if (!this.reducedMotion) this.spawnMolecules(g.slots[slot], g.yPre, W, H, Math.round(14 * SYNAPSES[this.transmitter].quantum * drugEffect(this.drug, SYNAPSES[this.transmitter]).quantum));
    }
    // Refill tracks the model.
    if (s.docked > this.visDocked + 0.6) this.visDocked = Math.min(C.docked, Math.round(s.docked));
    this.lastFusionAge += dt;
    this.fusions.forEach((f) => (f.age += dt));
    this.fusions = this.fusions.filter((f) => f.age < 0.9);

    if (this.reducedMotion) {
      this.ions = [];
      this.syncMolecules(true);
      return;
    }
    this.syncMolecules(false);
    this.moveMolecules(dt, W, H, g);

    // Calcium ions through open calcium channels.
    const caOpen = Math.max(0, s.caGate - caInf(C.vRestPre));
    this.spawnCa += caOpen * 40 * dt;
    while (this.spawnCa >= 1) {
      this.spawnCa -= 1;
      const x = g.caX[Math.floor(Math.random() * g.caX.length)];
      this.ions.push({ kind: 'ca', x, y0: g.yPre + (g.yPost - g.yPre) * 0.45, y1: g.yPre - H * 0.08, p: 0, jitter: Math.random() - 0.5 });
    }
    // Ions through postsynaptic channels.
    const T = SYNAPSES[this.transmitter];
    const restOpen = this.syn.steadyCleft() > 0 || drugEffect(this.drug, T).agonist > 0 ? 0 : 0;
    const flow = Math.max(0, s.open - restOpen) * T.gMax;
    this.spawnIon += Math.min(30, flow * 28) * dt;
    while (this.spawnIon >= 1) {
      this.spawnIon -= 1;
      const xs = T.receptor === 'ionotropic' ? g.recX : g.kX;
      const x = xs[Math.floor(Math.random() * xs.length)];
      const inward = T.ion !== 'k';
      const outside = g.yPost - H * 0.07;
      const inside = g.yPost + H * 0.11;
      this.ions.push({ kind: T.ion, x, y0: inward ? outside : inside, y1: inward ? inside : outside, p: 0, jitter: Math.random() - 0.5 });
    }
    for (const ion of this.ions) ion.p += dt / 0.9;
    this.ions = this.ions.filter((i) => i.p < 1);
    if (this.ions.length > 160) this.ions.splice(0, this.ions.length - 160);
  }

  private spawnMolecules(x: number, yPre: number, W: number, H: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.15 + 0.7 * Math.random());
      const sp = (0.25 + Math.random() * 0.35) * H;
      this.molecules.push({ x: x + (Math.random() - 0.5) * 6, y: yPre + 4, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp * 0.5, state: 'free', tx: 0, ty: 0, life: 1, how: 'diffuse' });
    }
    void W;
  }

  /** Make the number of drawn transmitter molecules follow the model's cleft level. */
  private syncMolecules(instant: boolean) {
    const s = this.syn.s;
    const W = this.scene?.clientWidth || 400;
    const H = this.scene?.clientHeight || 340;
    const g = this.geom(W, H);
    const target = Math.min(90, Math.round(s.cleft * 14));
    const free = this.molecules.filter((m) => m.state === 'free');
    if (instant) {
      // Place molecules directly, e.g. after a jump to the next step.
      const rand = rng(Math.round(s.t * 10) + 3);
      this.molecules = Array.from({ length: target }, () => ({
        x: W * (0.12 + 0.76 * rand()),
        y: g.yPre + 4 + (g.yPost - g.yPre - 8) * rand(),
        vx: 0,
        vy: 0,
        state: 'free' as const,
        tx: 0,
        ty: 0,
        life: 1,
        how: 'diffuse' as const,
      }));
      return;
    }
    if (free.length < target) {
      // Tonic leak (MDMA) comes out of the transporters; otherwise top up near the last fusion.
      const eff = drugEffect(this.drug, SYNAPSES[this.transmitter]);
      for (let i = free.length; i < target; i++) {
        const x = eff.tonic > 0 && this.lastFusionAge > 0.5 ? g.transX[i % 2] : this.lastFusionX * W + (Math.random() - 0.5) * W * 0.1;
        this.molecules.push({ x, y: g.yPre + 4, vx: (Math.random() - 0.5) * 40, vy: 30 + Math.random() * 40, state: 'free', tx: 0, ty: 0, life: 1, how: 'diffuse' });
      }
    } else if (free.length > target) {
      const T = SYNAPSES[this.transmitter];
      const eff = drugEffect(this.drug, T);
      const wU = T.kUptake * eff.uptake;
      const wE = T.kEnzyme * eff.enzyme;
      const wD = T.kDiffuse;
      let extra = free.length - target;
      for (const m of free) {
        if (extra <= 0) break;
        const r = Math.random() * (wU + wE + wD);
        if (r < wU) {
          m.how = 'uptake';
          const right = m.x > W / 2;
          const astro = (T.id === 'glutamate' || T.id === 'gaba') && right && Math.random() < 0.5;
          m.tx = astro ? W * 0.95 : g.transX[right ? 1 : 0];
          m.ty = astro ? (g.yPre + g.yPost) / 2 : g.yPre - 4;
        } else if (r < wU + wE) {
          m.how = 'enzyme';
          let best = g.enzX[0];
          for (const ex of g.enzX) if (Math.abs(ex - m.x) < Math.abs(best - m.x)) best = ex;
          m.tx = best;
          m.ty = g.yPost - (g.yPost - g.yPre) * 0.28;
        } else {
          m.how = 'diffuse';
          m.tx = m.x < W / 2 ? -10 : W + 10;
          m.ty = (g.yPre + g.yPost) / 2;
        }
        m.state = 'leaving';
        extra--;
      }
    }
  }

  private moveMolecules(dt: number, W: number, H: number, g: ReturnType<SynapseElement['geom']>) {
    const top = g.yPre + 3;
    const bot = g.yPost - 3;
    for (const m of this.molecules) {
      if (m.state === 'free') {
        m.vx += (Math.random() - 0.5) * 900 * dt;
        m.vy += (Math.random() - 0.5) * 900 * dt;
        m.vx *= 0.9;
        m.vy *= 0.9;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y < top) {
          m.y = top;
          m.vy = Math.abs(m.vy);
        }
        if (m.y > bot) {
          m.y = bot;
          m.vy = -Math.abs(m.vy);
        }
        m.x = Math.min(W * 0.93, Math.max(W * 0.07, m.x));
      } else {
        const speed = m.how === 'diffuse' ? 2.2 : 3.2;
        m.x += (m.tx - m.x) * Math.min(1, speed * dt);
        m.y += (m.ty - m.y) * Math.min(1, speed * dt);
        m.life -= dt / (m.how === 'enzyme' ? 0.55 : 0.8);
      }
    }
    this.molecules = this.molecules.filter((m) => m.life > 0);
    void H;
  }

  // ---------- Drawing ----------

  private palette() {
    return readPalette(this, {
      bg: '--bg',
      surface: '--surface',
      surface2: '--surface-2',
      surface3: '--surface-3',
      border: '--border',
      borderStrong: '--border-strong',
      text: '--text',
      muted: '--text-muted',
      faint: '--text-faint',
      na: '--ion-na',
      k: '--ion-k',
      cl: '--ion-cl',
      ca: '--ion-ca',
      excite: '--excite',
      inhibit: '--inhibit',
      accent: '--accent',
      membrane: '--membrane',
      membraneEdge: '--membrane-edge',
      trace: '--trace',
      grid: '--grid',
      good: '--good',
      bad: '--bad',
      warn: '--warn',
      mono: '--font-mono',
    });
  }

  protected render(): void {
    if (!this.scene) return;
    const pal = this.palette();
    this.drawScene(pal);
    this.drawTrace(pal);
    const now = performance.now();
    if (now - this.lastReadout > 100 || !this.playing) {
      this.lastReadout = now;
      this.updateReadouts();
    }
  }

  private setCaption(text: string) {
    const el = this.$('.caption');
    if (el.textContent !== text) el.textContent = text;
  }

  private updateReadouts() {
    const signed = (x: number) => (Math.abs(x) < 0.05 ? '0.0 mV' : `${x > 0 ? '+' : '−'}${fmt(Math.abs(x), 1)} mV`);
    this.$('.r-rel').textContent = this.hasFired ? `≈ ${fmt(this.lastReleased, 1)} vesicles` : '—';
    this.$('.r-docked').textContent = `${Math.round(this.syn.s.docked)} of ${C.docked}`;
    this.$('.r-psp').textContent = this.hasFired ? signed(this.peakDv) : '—';
    this.$('.r-ctrl').textContent = this.hasFired ? signed(this.peakDvCtrl) : '—';
    if (this.playing && !this.syn.tracking() && this.hasFired && !this.syn.active() && !this.pinnedCaption && this.stageNow === 'recycled') {
      // Leave the last step's text up.
    }
  }

  private drawScene(pal: ReturnType<SynapseElement['palette']>) {
    const { w: W, h: H } = fitCanvas(this.scene);
    const ctx = this.scene.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const T = SYNAPSES[this.transmitter];
    const s = this.syn.s;
    const eff = drugEffect(this.drug, T);
    const g = this.geom(W, H);
    const scale = this.hasAttribute('present') ? 1.25 : 1;
    const narrow = W < 430;
    const font = (px: number, weight = 400) => `${weight} ${Math.round(px * scale)}px ${pal.mono || 'monospace'}`;
    const memW = Math.max(5, H * 0.022);
    const drugSite = DRUGS.find((d) => d.id === this.drug)!.site;

    // ---- Astrocyte (glutamate and GABA synapses) ----
    const astro = T.id === 'glutamate' || T.id === 'gaba';
    if (astro) {
      ctx.fillStyle = withAlpha(pal.good, 0.08);
      ctx.strokeStyle = withAlpha(pal.good, 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(W * 1.0, (g.yPre + g.yPost) / 2, W * 0.07, (g.yPost - g.yPre) * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // transporter on the astrocyte
      this.drawTransporter(ctx, W * 0.945, (g.yPre + g.yPost) / 2, g.r, pal, eff.uptake < 1, true);
      if (!narrow) {
        ctx.save();
        ctx.translate(W - 6, g.yPost + (g.yPost - g.yPre) * 0.45);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = pal.faint;
        ctx.font = font(10);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('ASTROCYTE', 0, 0);
        ctx.restore();
      }
    }

    // ---- Presynaptic terminal ----
    const preTint = Math.max(0, Math.min(1, (s.vPre - C.vRestPre) / 90));
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, W * 0.42, -20, W * 0.16, H * 0.16, 6);
    roundRect(ctx, W * 0.08, H * 0.08, W * 0.84, g.yPre - H * 0.08, W * 0.1);
    ctx.fillStyle = pal.surface2;
    ctx.fill();
    ctx.fillStyle = withAlpha(pal.excite, 0.05 + 0.3 * preTint);
    ctx.fill();
    ctx.restore();
    // the spike coming down the axon
    for (const ts of this.spikeTimes) {
      const u = s.t - ts;
      if (u > -0.6 && u < 0.3) {
        const y = H * 0.1 * (1 + u / 0.6);
        const grad = ctx.createLinearGradient(0, y - 18, 0, y + 18);
        grad.addColorStop(0, withAlpha(pal.excite, 0));
        grad.addColorStop(0.5, withAlpha(pal.excite, 0.75));
        grad.addColorStop(1, withAlpha(pal.excite, 0));
        ctx.fillStyle = grad;
        ctx.fillRect(W * 0.42, Math.max(0, y - 18), W * 0.16, 36);
      }
    }
    // calcium glow in the active zone
    if (s.ca > 0.01) {
      const grad = ctx.createRadialGradient(W * 0.5, g.yPre, 2, W * 0.5, g.yPre, W * 0.3);
      grad.addColorStop(0, withAlpha(pal.ca, Math.min(0.55, s.ca * 0.45)));
      grad.addColorStop(1, withAlpha(pal.ca, 0));
      ctx.fillStyle = grad;
      ctx.fillRect(W * 0.15, g.yPre - W * 0.3, W * 0.7, W * 0.3);
    }
    // membrane outline of the terminal (the bottom is the active zone)
    ctx.strokeStyle = pal.membrane;
    ctx.lineWidth = memW;
    ctx.beginPath();
    ctx.moveTo(W * 0.42, 0);
    ctx.lineTo(W * 0.42, H * 0.08);
    ctx.arcTo(W * 0.08, H * 0.08, W * 0.08, g.yPre, W * 0.1);
    ctx.arcTo(W * 0.08, g.yPre, W * 0.92, g.yPre, W * 0.1);
    ctx.arcTo(W * 0.92, g.yPre, W * 0.92, H * 0.08, W * 0.1);
    ctx.arcTo(W * 0.92, H * 0.08, W * 0.58, H * 0.08, W * 0.1);
    ctx.lineTo(W * 0.58, H * 0.08);
    ctx.lineTo(W * 0.58, 0);
    ctx.stroke();

    ctx.fillStyle = pal.faint;
    ctx.font = font(10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(narrow ? 'TERMINAL' : 'PRESYNAPTIC TERMINAL', W * 0.12, H * 0.11);

    // reserve vesicles
    const rand = rng(11);
    const vesFill = this.drug === 'release-block' && T.id === 'serotonin' ? 0.15 : eff.quantum > 1 ? 1 : 0.8;
    for (let i = 0; i < 6; i++) {
      const x = W * (0.2 + 0.6 * rand());
      const y = H * 0.2 + rand() * (g.yPre - H * 0.32);
      const wob = this.reducedMotion ? 0 : Math.sin(this.clock * 1.3 + i) * 1.5;
      this.drawVesicle(ctx, x + wob, y, g.r, pal, vesFill);
    }
    // MAO inside a serotonin terminal, GABA transaminase inside a GABA terminal
    if (T.enzymeInTerminal) {
      const ex = W * 0.2;
      const ey = g.yPre - H * 0.09;
      this.drawEnzyme(ctx, ex, ey, g.r * 0.9, pal, eff.quantum > 1, 0);
      if (!narrow) {
        ctx.fillStyle = pal.faint;
        ctx.font = font(9);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(T.id === 'serotonin' ? 'MAO' : 'GABA-T', ex + g.r * 1.3, ey);
      }
    }
    // docked vesicles
    const order = this.slotOrder();
    const nDocked = Math.round(this.visDocked);
    const filled = new Set(order.slice(0, nDocked));
    g.slots.forEach((x, i) => {
      if (filled.has(i)) this.drawVesicle(ctx, x, g.yPre - g.r - memW / 2 - 1, g.r, pal, vesFill, this.drug === 'release-block' && T.id !== 'serotonin');
    });
    // fusing vesicles
    for (const f of this.fusions) {
      const x = g.slots[f.slot];
      const k = Math.min(1, f.age / 0.5);
      const y = g.yPre - g.r * (1 - k) - memW / 2;
      ctx.strokeStyle = pal.membrane;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, g.r * (1 - 0.4 * k), Math.PI * (0.15 + 0.7 * k) * -1 + Math.PI, Math.PI * 2 + Math.PI * (0.15 + 0.7 * k) * -1 + Math.PI - Math.PI * 1.4 * k);
      ctx.stroke();
    }

    // membrane bottom (draw again so channels sit on top)
    ctx.strokeStyle = pal.membrane;
    ctx.lineWidth = memW;
    ctx.beginPath();
    ctx.moveTo(W * 0.18, g.yPre);
    ctx.lineTo(W * 0.82, g.yPre);
    ctx.stroke();

    // calcium channels
    const caOpen = Math.max(0, Math.min(1, (s.caGate - caInf(C.vRestPre)) / 0.9));
    for (const x of g.caX) this.drawChannel(ctx, x, g.yPre, memW * 2.2, memW * 1.6, pal.ca, caOpen, pal);
    // reuptake transporters (or choline transporters) on the terminal
    for (const x of g.transX) this.drawTransporter(ctx, x, g.yPre, g.r, pal, eff.uptake < 1, false, T.id === 'ach');
    // autoreceptor
    this.drawAutoreceptor(ctx, g.autoX, g.yPre, g.r, pal, s.auto);

    // ---- Cleft ----
    if (!narrow) {
      ctx.fillStyle = pal.faint;
      ctx.font = font(10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('CLEFT', W * 0.015, (g.yPre + g.yPost) / 2);
    }
    // acetylcholinesterase
    if (T.kEnzyme > 0) {
      for (const [i, x] of g.enzX.entries()) {
        const chomp = this.reducedMotion ? 0.3 : 0.3 + 0.25 * Math.sin(this.clock * 9 + i) * Math.min(1, s.cleft * 2);
        this.drawEnzyme(ctx, x, g.yPost - (g.yPost - g.yPre) * 0.28, g.r * 0.95, pal, eff.enzyme < 1, chomp);
      }
    }

    // ---- Postsynaptic cell ----
    const dv = s.v - C.vRestPost;
    const tint = Math.max(-1, Math.min(1, dv / 10));
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, W * 0.05, g.yPost, W * 0.9, H - g.yPost + 30, W * 0.06);
    ctx.fillStyle = pal.surface2;
    ctx.fill();
    if (Math.abs(tint) > 0.02) {
      ctx.fillStyle = withAlpha(tint > 0 ? pal.excite : pal.inhibit, 0.36 * Math.abs(tint));
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = pal.membrane;
    ctx.lineWidth = memW;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, H + 5);
    ctx.lineTo(W * 0.05, g.yPost + W * 0.06);
    ctx.arcTo(W * 0.05, g.yPost, W * 0.95, g.yPost, W * 0.06);
    ctx.arcTo(W * 0.95, g.yPost, W * 0.95, H, W * 0.06);
    ctx.lineTo(W * 0.95, H + 5);
    ctx.stroke();
    ctx.fillStyle = pal.faint;
    ctx.font = font(10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(narrow ? 'POSTSYNAPTIC' : 'POSTSYNAPTIC CELL', W * 0.09, H - 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.muted;
    ctx.fillText(`${fmt(s.v, 1)} mV`, W * 0.91, H - 8);

    // receptors
    const antagonistFrac = eff.antagonist / (1 + eff.antagonist + s.cleft / T.kd);
    if (T.receptor === 'ionotropic') {
      g.recX.forEach((x, i) => {
        const blocked = eff.antagonist > 0 && i % 4 !== 3 && antagonistFrac > 0.3;
        const agon = eff.agonist > 0 && i === 1;
        this.drawReceptorChannel(ctx, x, g.yPost, memW, g.r, T.ion === 'cl' ? pal.cl : pal.na, s.open, pal, blocked, agon, s.occupancy);
      });
    } else {
      g.recX.forEach((x, i) => {
        const blocked = eff.antagonist > 0 && antagonistFrac > 0.3 && i === 0;
        this.drawGpcr(ctx, x, g.yPost, memW, g.r, pal, s.occupancy, blocked, eff.agonist > 0 && i === 1);
      });
      // G proteins travel from the receptors to the K⁺ channels as the cascade builds.
      const gp = Math.min(1, s.gProtein * 1.6);
      for (let i = 0; i < 2; i++) {
        const x0 = g.recX[i];
        const x1 = g.kX[i];
        const x = x0 + (x1 - x0) * Math.min(1, gp * 1.2);
        const y = g.yPost + memW + g.r * 0.9;
        ctx.fillStyle = withAlpha(pal.accent, 0.25 + 0.7 * gp);
        for (let j = 0; j < 3; j++) {
          ctx.beginPath();
          ctx.arc(x - g.r * 0.5 + j * g.r * 0.5, y + (j === 1 ? g.r * 0.35 : 0), g.r * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const x of g.kX) this.drawChannel(ctx, x, g.yPost, memW * 2.4, memW * 1.7, pal.k, Math.min(1, s.open * 1.6), pal);
      if (!narrow) {
        ctx.fillStyle = pal.faint;
        ctx.font = font(9);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('G protein', (g.recX[0] + g.kX[0]) / 2, g.yPost + memW + g.r * 1.8);
        ctx.fillText('K⁺ channel', g.kX[1], g.yPost + memW * 2 + 4);
      }
    }

    // ---- particles ----
    const ionR = Math.max(2.6, Math.min(4.2, W / 120));
    for (const ion of this.ions) {
      const y = ion.y0 + (ion.y1 - ion.y0) * ion.p;
      const color = ion.kind === 'ca' ? pal.ca : ion.kind === 'na' ? pal.na : ion.kind === 'cl' ? pal.cl : pal.k;
      drawIon(ctx, ion.kind, ion.x + ion.jitter * 4, y, ionR, withAlpha(color, Math.min(1, 1.6 - ion.p * 1.4)));
    }
    if (this.reducedMotion || !this.playing) {
      // A still picture: open channels show one ion inside.
      if (caOpen > 0.3) for (const x of g.caX) drawIon(ctx, 'ca', x, g.yPre, ionR, pal.ca);
    }
    const molR = Math.max(1.8, Math.min(3, W / 170));
    for (const m of this.molecules) {
      ctx.fillStyle = withAlpha(pal.accent, Math.max(0, Math.min(1, m.life)));
      ctx.beginPath();
      ctx.arc(m.x, m.y, molR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- where the drug acts ----
    if (this.drug !== 'none' && eff.hasTarget) {
      let hx = W / 2;
      let hy = g.yPost;
      if (drugSite === 'receptors') hx = g.recX[Math.min(1, g.recX.length - 1)];
      if (drugSite === 'transporters') {
        hx = g.transX[0];
        hy = g.yPre;
      }
      if (drugSite === 'enzyme') {
        if (T.kEnzyme > 0) {
          hx = g.enzX[0];
          hy = g.yPost - (g.yPost - g.yPre) * 0.28;
        } else {
          hx = W * 0.2;
          hy = g.yPre - H * 0.09;
        }
      }
      if (drugSite === 'vesicles') {
        hx = T.id === 'serotonin' && this.drug === 'release-boost' ? g.transX[1] : W * 0.5;
        hy = T.id === 'serotonin' && this.drug === 'release-boost' ? g.yPre : g.yPre - g.r * 1.2;
      }
      const pulse = this.reducedMotion ? 0 : 0.5 + 0.5 * Math.sin(this.clock * 4);
      ctx.strokeStyle = withAlpha(pal.warn, 0.55 + 0.35 * pulse);
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(hx, hy, g.r * 2.4 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = pal.warn;
      ctx.font = font(10, 700);
      ctx.textBaseline = 'middle';
      const label = 'DRUG ACTS HERE';
      const tw = ctx.measureText(label).width;
      let lx = hx + g.r * 2.8;
      ctx.textAlign = 'left';
      if (lx + tw > W - 4) {
        lx = hx - g.r * 2.8;
        ctx.textAlign = 'right';
      }
      const ly = drugSite === 'receptors' ? hy + g.r * 3.2 : hy - g.r * 3;
      ctx.fillText(label, lx, Math.max(10, Math.min(H - 20, ly)));
    }
  }

  private drawVesicle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pal: ReturnType<SynapseElement['palette']>, fill: number, stuck = false) {
    ctx.fillStyle = withAlpha(pal.surface, 0.9);
    ctx.strokeStyle = pal.membrane;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const n = Math.round(6 * fill);
    ctx.fillStyle = pal.accent;
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, n)) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, Math.max(1.2, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
    if (stuck) {
      // A release blocker: the docking proteins are cut, so the vesicle cannot fuse.
      ctx.strokeStyle = pal.bad;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.5, y + r + 1);
      ctx.lineTo(x + r * 0.5, y + r + 5);
      ctx.moveTo(x + r * 0.5, y + r + 1);
      ctx.lineTo(x - r * 0.5, y + r + 5);
      ctx.stroke();
    }
  }

  private drawChannel(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, w: number, color: string, open: number, pal: ReturnType<SynapseElement['palette']>) {
    const gap = w * (0.12 + 0.5 * open);
    ctx.fillStyle = color;
    roundRect(ctx, x - gap / 2 - w * 0.55, y - h / 2, w * 0.55, h, 2);
    ctx.fill();
    roundRect(ctx, x + gap / 2, y - h / 2, w * 0.55, h, 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(pal.bg, 0.6);
    ctx.lineWidth = 1;
    roundRect(ctx, x - gap / 2 - w * 0.55, y - h / 2, w * 0.55, h, 2);
    ctx.stroke();
    roundRect(ctx, x + gap / 2, y - h / 2, w * 0.55, h, 2);
    ctx.stroke();
  }

  private drawTransporter(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pal: ReturnType<SynapseElement['palette']>, blocked: boolean, vertical: boolean, choline = false) {
    ctx.save();
    ctx.translate(x, y);
    if (vertical) ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = choline ? pal.surface3 : pal.good;
    ctx.strokeStyle = withAlpha(pal.bg, 0.7);
    ctx.lineWidth = 1;
    roundRect(ctx, -r * 0.75, -r * 0.9, r * 1.5, r * 1.8, r * 0.5);
    ctx.fill();
    ctx.stroke();
    // arrow pointing into the cell
    ctx.strokeStyle = choline ? pal.muted : pal.bg;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, r * 0.55);
    ctx.lineTo(0, -r * 0.5);
    ctx.moveTo(-r * 0.3, -r * 0.2);
    ctx.lineTo(0, -r * 0.55);
    ctx.lineTo(r * 0.3, -r * 0.2);
    ctx.stroke();
    if (blocked) {
      ctx.fillStyle = pal.bad;
      roundRect(ctx, -r * 0.75, r * 0.55, r * 1.5, r * 0.7, 3);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawAutoreceptor(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pal: ReturnType<SynapseElement['palette']>, active: number) {
    ctx.strokeStyle = withAlpha(pal.accent, 0.5 + 0.5 * Math.min(1, active * 3));
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + r * 0.9);
    ctx.moveTo(x, y + r * 0.9);
    ctx.lineTo(x - r * 0.5, y + r * 1.4);
    ctx.moveTo(x, y + r * 0.9);
    ctx.lineTo(x + r * 0.5, y + r * 1.4);
    ctx.stroke();
  }

  private drawEnzyme(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pal: ReturnType<SynapseElement['palette']>, blocked: boolean, mouth: number) {
    const m = Math.max(0.05, Math.min(0.8, mouth));
    ctx.fillStyle = pal.k;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, -Math.PI / 2 + m, -Math.PI / 2 + Math.PI * 2 - m);
    ctx.closePath();
    ctx.fill();
    if (blocked) {
      ctx.strokeStyle = pal.bad;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
      ctx.stroke();
    }
  }

  private drawReceptorChannel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    memW: number,
    r: number,
    color: string,
    open: number,
    pal: ReturnType<SynapseElement['palette']>,
    blocked: boolean,
    agonist: boolean,
    occ: number,
  ) {
    const h = memW * 2.6;
    const w = r * 1.5;
    this.drawChannel(ctx, x, y, h, w, color, Math.min(1, open * 1.5), pal);
    // binding cups on top
    const cupY = y - h / 2 - r * 0.25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const side of [-1, 1]) {
      const cx = x + side * w * 0.42;
      ctx.beginPath();
      ctx.arc(cx, cupY, r * 0.32, Math.PI * 0.05, Math.PI * 0.95, true);
      ctx.stroke();
      if (occ > 0.15 && !blocked) {
        ctx.fillStyle = pal.accent;
        ctx.beginPath();
        ctx.arc(cx, cupY - r * 0.12, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (blocked) {
      ctx.fillStyle = pal.bad;
      roundRect(ctx, x - w * 0.62, cupY - r * 0.55, w * 1.24, r * 0.45, 3);
      ctx.fill();
    }
    if (agonist) {
      ctx.fillStyle = pal.good;
      this.star(ctx, x - w * 0.42, cupY - r * 0.15, r * 0.36);
      this.star(ctx, x + w * 0.42, cupY - r * 0.15, r * 0.36);
    }
  }

  private drawGpcr(ctx: CanvasRenderingContext2D, x: number, y: number, memW: number, r: number, pal: ReturnType<SynapseElement['palette']>, occ: number, blocked: boolean, agonist: boolean) {
    ctx.fillStyle = withAlpha(pal.accent, 0.35 + 0.5 * Math.min(1, occ * 2));
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 1.5;
    // a squiggle of seven loops across the membrane, simplified to a rounded block
    roundRect(ctx, x - r * 1.1, y - memW * 1.6, r * 2.2, memW * 3.2, r * 0.6);
    ctx.fill();
    ctx.stroke();
    const cupY = y - memW * 1.6 - r * 0.3;
    ctx.beginPath();
    ctx.arc(x, cupY, r * 0.35, Math.PI * 0.05, Math.PI * 0.95, true);
    ctx.stroke();
    if (blocked) {
      ctx.fillStyle = pal.bad;
      roundRect(ctx, x - r * 0.6, cupY - r * 0.55, r * 1.2, r * 0.45, 3);
      ctx.fill();
    } else if (agonist) {
      ctx.fillStyle = pal.good;
      this.star(ctx, x, cupY - r * 0.15, r * 0.4);
    } else if (occ > 0.12) {
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(x, cupY - r * 0.12, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawTrace(pal: ReturnType<SynapseElement['palette']>) {
    const { w: W, h: H } = fitCanvas(this.trace);
    const ctx = this.trace.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const T = SYNAPSES[this.transmitter];
    const scale = this.hasAttribute('present') ? 1.2 : 1;
    const mono = (px: number) => `${Math.round(px * scale)}px ${pal.mono || 'monospace'}`;
    const narrow = W < 460;
    const left = narrow ? 40 : 48;
    const right = 10;
    const tNow = this.syn.s.t;
    const t0 = tNow - T.window;
    const xOf = (t: number) => left + ((t - t0) / T.window) * (W - left - right);
    const showCtrl = this.drug !== 'none';
    const gap = 8;
    const axisH = 22;
    const avail = H - axisH - gap * 2 - 6;
    const h1 = avail * 0.26;
    const h2 = avail * 0.28;
    const h3 = avail - h1 - h2;
    const y1 = 6;
    const y2 = y1 + h1 + gap;
    const y3 = y2 + h2 + gap;

    const strip = (y: number, h: number, title: string) => {
      ctx.fillStyle = withAlpha(pal.surface2, 0.6);
      ctx.fillRect(left, y, W - left - right, h);
      ctx.fillStyle = pal.muted;
      ctx.font = mono(10);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(title, left + 6, y + 4);
    };
    const line = (y: number, h: number, lo: number, hi: number, get: (s: Sample) => number, color: string, dash: number[] = [], width = 2) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, y, W - left - right, h);
      ctx.clip();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      let started = false;
      for (const smp of this.samples) {
        if (smp.t < t0) continue;
        const x = xOf(smp.t);
        const yy = y + h - ((get(smp) - lo) / (hi - lo)) * h;
        if (!started) {
          ctx.moveTo(x, yy);
          started = true;
        } else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.restore();
    };
    const yLabel = (y: number, h: number, lo: number, hi: number, v: number, text: string) => {
      const yy = y + h - ((v - lo) / (hi - lo)) * h;
      ctx.fillStyle = pal.faint;
      ctx.font = mono(9.5);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, left - 5, yy);
      ctx.strokeStyle = pal.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(W - right, yy);
      ctx.stroke();
    };

    // 1. Terminal voltage and calcium
    strip(y1, h1, narrow ? 'Terminal: V and Ca²⁺' : 'Terminal: voltage (line) and Ca²⁺ (shaded)');
    yLabel(y1, h1, -75, 45, -65, '−65');
    yLabel(y1, h1, -75, 45, 30, '+30');
    // calcium as a filled area
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, y1, W - left - right, h1);
    ctx.clip();
    ctx.fillStyle = withAlpha(pal.ca, 0.45);
    ctx.beginPath();
    ctx.moveTo(xOf(Math.max(t0, this.samples[0]?.t ?? t0)), y1 + h1);
    for (const smp of this.samples) if (smp.t >= t0) ctx.lineTo(xOf(smp.t), y1 + h1 - Math.min(1.3, smp.ca) / 1.3 * h1 * 0.85);
    ctx.lineTo(xOf(this.samples[this.samples.length - 1]?.t ?? tNow), y1 + h1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    line(y1, h1, -75, 45, (s) => s.vPre, pal.excite, [], 1.8);

    // 2. Transmitter in the cleft
    const cMax = Math.max(1.5, ...this.samples.map((s) => Math.max(s.cleft, showCtrl ? s.cleftCtrl : 0))) * 1.1;
    strip(y2, h2, `${T.name} in the cleft`);
    yLabel(y2, h2, 0, cMax, 0, '0');
    if (showCtrl) line(y2, h2, 0, cMax, (s) => s.cleftCtrl, pal.faint, [5, 4], 1.6);
    line(y2, h2, 0, cMax, (s) => s.cleft, pal.accent, [], 2);

    // 3. Postsynaptic potential
    let lo = -72;
    let hi = -52;
    for (const s of this.samples) {
      lo = Math.min(lo, s.v - 1, showCtrl ? s.vCtrl - 1 : lo);
      hi = Math.max(hi, s.v + 1, showCtrl ? s.vCtrl + 1 : hi);
    }
    strip(y3, h3, narrow ? 'Postsynaptic (mV)' : 'Postsynaptic membrane potential (mV)');
    yLabel(y3, h3, lo, hi, -65, '−65');
    // threshold
    const yTh = y3 + h3 - ((C.threshold - lo) / (hi - lo)) * h3;
    ctx.strokeStyle = withAlpha(pal.bad, 0.7);
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left, yTh);
    ctx.lineTo(W - right, yTh);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = pal.bad;
    ctx.font = mono(9.5);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('−55', left - 5, yTh);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(narrow ? 'threshold' : 'threshold for firing', W - right - 4, yTh - 2);
    if (showCtrl) line(y3, h3, lo, hi, (s) => s.vCtrl, pal.faint, [5, 4], 1.6);
    line(y3, h3, lo, hi, (s) => s.v, pal.trace, [], 2.2);

    // spike markers and time axis
    ctx.fillStyle = pal.excite;
    for (const ts of this.spikeTimes) {
      if (ts < t0 || ts > tNow) continue;
      const x = xOf(ts);
      ctx.beginPath();
      ctx.moveTo(x, y1 - 2);
      ctx.lineTo(x - 4, y1 - 8 + 4);
      ctx.lineTo(x + 4, y1 - 8 + 4);
      ctx.closePath();
      ctx.fill();
    }
    const step = T.window >= 200 ? 100 : 10;
    ctx.fillStyle = pal.faint;
    ctx.font = mono(9.5);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const yAxis = y3 + h3 + 4;
    for (let k = 0; k <= T.window; k += step) {
      const x = xOf(tNow - k);
      if (k === T.window) {
        ctx.textAlign = 'left';
        ctx.fillText(`−${k} ms`, left, yAxis);
      } else {
        ctx.textAlign = k === 0 ? 'right' : 'center';
        ctx.fillText(k === 0 ? 'now' : `−${k}`, k === 0 ? W - right : x, yAxis);
      }
    }
  }
}

if (!customElements.get('nc-synapse')) customElements.define('nc-synapse', SynapseElement);
