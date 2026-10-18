import { uiCss } from './ui-css';
import { onSettingsChange, prefersReducedMotion } from './settings';

/**
 * Base class for every simulation. It owns the animation loop and the simulation contract:
 * play, pause, step and reset; pausing when off screen or in a background tab; reduced motion;
 * a polite live region for screen readers; "predict, then watch" questions; and PNG export.
 */

export interface PredictQuestion {
  id: string;
  question: string;
  options: string[];
  correct: number;
  explain: string;
}

let sheet: CSSStyleSheet | null = null;
function sharedSheet(): CSSStyleSheet | null {
  if (sheet) return sheet;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(uiCss);
    return sheet;
  } catch {
    return null;
  }
}

export abstract class SimElement extends HTMLElement {
  protected root: ShadowRoot;
  protected playing = false;
  protected visible = true;
  protected reducedMotion = false;
  private raf = 0;
  private lastFrame = 0;
  private io?: IntersectionObserver;
  private ro?: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private liveEl?: HTMLElement;
  private lastAnnounce = 0;
  private asked = new Set<string>();
  protected predictEnabled = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const s = sharedSheet();
    if (s) this.root.adoptedStyleSheets = [s];
    else {
      const style = document.createElement('style');
      style.textContent = uiCss;
      this.root.append(style);
    }
  }

  /** Build the DOM. Called once on first connect. */
  protected abstract build(): void;
  /** Advance the model by `dtReal` seconds of wall-clock time. */
  protected abstract tick(dtReal: number): void;
  /** Draw the current state. */
  protected abstract render(): void;
  /** Return the model to its starting state. */
  abstract reset(): void;
  /** Advance by one small step while paused. */
  abstract stepOnce(): void;

  private built = false;

  connectedCallback(): void {
    if (!this.built) {
      this.built = true;
      this.reducedMotion = prefersReducedMotion();
      this.predictEnabled = this.hasAttribute('predict');
      this.build();
      this.liveEl = document.createElement('div');
      this.liveEl.className = 'visually-hidden';
      this.liveEl.setAttribute('aria-live', 'polite');
      this.root.append(this.liveEl);
    }
    this.io = new IntersectionObserver((entries) => {
      this.visible = entries.some((e) => e.isIntersecting);
      this.syncLoop();
    });
    this.io.observe(this);
    this.ro = new ResizeObserver(() => this.render());
    this.ro.observe(this);
    const onVis = () => this.syncLoop();
    document.addEventListener('visibilitychange', onVis);
    this.cleanup.push(() => document.removeEventListener('visibilitychange', onVis));
    this.cleanup.push(
      onSettingsChange(() => {
        this.reducedMotion = prefersReducedMotion();
        this.onSettings();
        this.render();
      }),
    );
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = () => {
      this.reducedMotion = prefersReducedMotion();
      this.render();
    };
    mq.addEventListener('change', onMq);
    this.cleanup.push(() => mq.removeEventListener('change', onMq));
    // Re-read colours when the theme attribute flips.
    const mo = new MutationObserver(() => this.render());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.cleanup.push(() => mo.disconnect());
    requestAnimationFrame(() => this.render());
  }

  disconnectedCallback(): void {
    this.io?.disconnect();
    this.ro?.disconnect();
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Called when site settings change (sound, motion, theme). */
  protected onSettings(): void {}

  play(): void {
    this.playing = true;
    this.onPlayState();
    this.syncLoop();
  }

  pause(): void {
    this.playing = false;
    this.onPlayState();
    this.syncLoop();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Update play/pause buttons. */
  protected onPlayState(): void {}

  private syncLoop(): void {
    const shouldRun = this.playing && this.visible && !document.hidden;
    if (shouldRun && !this.raf) {
      this.lastFrame = performance.now();
      const frame = (now: number) => {
        const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
        this.lastFrame = now;
        this.tick(dt);
        this.render();
        this.raf = this.playing && this.visible && !document.hidden ? requestAnimationFrame(frame) : 0;
      };
      this.raf = requestAnimationFrame(frame);
    } else if (!shouldRun && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  /** Tell screen-reader users what is happening, at most every `minGapMs`. */
  protected announce(text: string, force = false, minGapMs = 1500): void {
    if (!this.liveEl) return;
    const now = performance.now();
    if (!force && now - this.lastAnnounce < minGapMs) return;
    this.lastAnnounce = now;
    this.liveEl.textContent = text;
  }

  /**
   * "Predict, then watch": pause, ask a question, then continue. Each question is asked
   * once per page visit. Resolves when the student continues.
   */
  protected ask(q: PredictQuestion): Promise<void> {
    if (!this.predictEnabled || this.asked.has(q.id)) return Promise.resolve();
    this.asked.add(q.id);
    const wasPlaying = this.playing;
    this.pause();
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'overlay';
      overlay.innerHTML = `
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="q-title">
          <div class="eyebrow">Predict, then watch</div>
          <h3 id="q-title"></h3>
          <div class="options"></div>
          <div class="feedback" hidden><p></p><button class="primary cont" type="button">Continue ▶</button></div>
        </div>`;
      overlay.querySelector('h3')!.textContent = q.question;
      const opts = overlay.querySelector('.options')!;
      const buttons = q.options.map((text, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.addEventListener('click', () => {
          buttons.forEach((x, j) => {
            x.disabled = true;
            if (j === q.correct) x.classList.add('right');
          });
          if (i !== q.correct) b.classList.add('wrong');
          const fb = overlay.querySelector('.feedback') as HTMLElement;
          fb.hidden = false;
          fb.querySelector('p')!.textContent = (i === q.correct ? 'Yes! ' : 'Not quite. ') + q.explain;
          (fb.querySelector('.cont') as HTMLButtonElement).focus();
        });
        opts.append(b);
        return b;
      });
      const finish = () => {
        overlay.remove();
        if (wasPlaying) this.play();
        resolve();
      };
      overlay.querySelector('.cont')!.addEventListener('click', finish);
      overlay.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Escape') finish();
      });
      (this.root.querySelector('.sim') ?? this.root).append(overlay);
      buttons[0]?.focus();
    });
  }

  /** Save one or more canvases side by side as a PNG, with a title line. */
  protected savePng(canvases: HTMLCanvasElement[], title: string, filename: string): void {
    const pad = 24;
    const titleH = 44;
    const scale = 2;
    const sizes = canvases.map((c) => {
      const r = c.getBoundingClientRect();
      return { w: r.width * scale, h: r.height * scale };
    });
    const out = document.createElement('canvas');
    out.width = sizes.reduce((s, x) => s + x.w, 0) + pad * (canvases.length + 1);
    out.height = Math.max(...sizes.map((s) => s.h)) + titleH + pad * 2;
    const ctx = out.getContext('2d')!;
    const style = getComputedStyle(this);
    ctx.fillStyle = style.getPropertyValue('--surface').trim() || '#151c2c';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = style.getPropertyValue('--text').trim() || '#fff';
    ctx.font = `700 ${16 * scale}px ${style.getPropertyValue('--font-display') || 'sans-serif'}`;
    ctx.fillText(title, pad, pad + 26);
    let x = pad;
    canvases.forEach((c, i) => {
      ctx.drawImage(c, x, pad + titleH, sizes[i].w, sizes[i].h);
      x += sizes[i].w + pad;
    });
    ctx.font = `${10 * scale}px sans-serif`;
    ctx.fillStyle = style.getPropertyValue('--text-muted').trim() || '#aaa';
    ctx.fillText('NeuroCapybara · CC BY 4.0', pad, out.height - 10);
    const a = document.createElement('a');
    a.download = filename;
    a.href = out.toDataURL('image/png');
    a.click();
  }

  /** Small helper to create elements from an HTML string inside the shadow root. */
  protected html(markup: string): void {
    const tpl = document.createElement('template');
    tpl.innerHTML = markup;
    this.root.append(tpl.content);
  }

  protected $(sel: string): HTMLElement {
    const el = this.root.querySelector(sel);
    if (!el) throw new Error(`Missing ${sel}`);
    return el as HTMLElement;
  }
}

/** Format numbers the way the site writes them, e.g. −65.0 with a true minus sign. */
export function fmt(x: number, digits = 1): string {
  const s = Math.abs(x).toFixed(digits);
  return (x < 0 && Number(s) !== 0 ? '−' : '') + s;
}
