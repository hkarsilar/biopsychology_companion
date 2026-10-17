import { uiCss } from '../shared/ui-css';
import { checkCategories, inPlaceCount, move, parseConfig, scrambledOrder, shuffle, type SorterConfig } from './model';

/**
 * <nc-sorter data-config='{"mode":"categories",...}'>: sort cards into bins, or put steps in order.
 *
 * Works without dragging: tap or press Enter on a card to pick it, then on a bin to place it.
 * In order mode, each step has "move up" and "move down" buttons. Nothing is stored or sent.
 */

const css = /* css */ `
.sorter { padding: 1rem 1.1rem 1.1rem; }
.sorter h3 { font-family: var(--font-display, system-ui); font-size: 1.15em; margin: 0 0 0.3rem; line-height: 1.25; }
.prompt { margin: 0 0 0.85rem; color: var(--text-muted, #a9b3c7); }
.tray-label, .bin-label { font-family: var(--font-mono, monospace); font-size: 0.75em; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint, #7d889f); margin: 0 0 0.4rem; }
.tray { display: flex; flex-wrap: wrap; gap: 0.45rem; min-height: 2.75rem; padding: 0.6rem; border: 1px dashed var(--border-strong, #3f4d6e); border-radius: var(--radius, 12px); margin-bottom: 0.85rem; }
.tray-empty { color: var(--text-faint, #7d889f); font-size: 0.9em; align-self: center; }
.card {
  white-space: normal; text-align: left; justify-content: flex-start;
  border-radius: var(--radius-s, 6px); font-weight: 500; line-height: 1.35;
  padding: 0.45rem 0.7rem; min-height: 2.5rem; max-width: 100%;
}
.card[aria-pressed='true'] { outline: 3px solid var(--accent, #b69cff); outline-offset: 1px; background: var(--accent-soft); }
.bins { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); }
.bin { border: 1px solid var(--border, #2c3854); border-radius: var(--radius, 12px); padding: 0.6rem; background: var(--surface-2, #1c2538); display: flex; flex-direction: column; gap: 0.45rem; min-width: 0; }
.bin-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.bin-title { font-weight: 700; }
.place { font-size: 0.85em; min-height: 2.2rem; padding: 0.2rem 0.7rem; }
.bin ul, .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.bin li { display: grid; gap: 0.25rem; }
.bin li .card { width: 100%; }
.fb { font-size: 0.85em; padding: 0.35rem 0.55rem; border-radius: var(--radius-s, 6px); background: var(--surface, #151c2c); border-left: 3px solid var(--border-strong, #3f4d6e); }
.fb.ok { border-left-color: var(--good, #5fd3a2); }
.fb.no { border-left-color: var(--bad, #ff8a80); }
.mark { font-weight: 700; margin-right: 0.3em; }
.mark.ok { color: var(--good, #5fd3a2); }
.mark.no { color: var(--bad, #ff8a80); }
.steps li { display: grid; grid-template-columns: 2rem 1fr auto; gap: 0.5rem; align-items: center; padding: 0.45rem 0.55rem; border: 1px solid var(--border, #2c3854); border-radius: var(--radius-s, 6px); background: var(--surface-2, #1c2538); }
.steps li.ok { border-color: var(--good, #5fd3a2); }
.steps li.no { border-color: var(--bad, #ff8a80); }
.steps .num { font-family: var(--font-mono, monospace); color: var(--text-muted, #a9b3c7); text-align: center; }
.steps .text { min-width: 0; }
.steps .text small { display: block; color: var(--text-muted, #a9b3c7); margin-top: 0.2rem; }
.steps .moves { display: flex; gap: 0.3rem; }
.steps .moves button { min-width: 2.4rem; min-height: 2.4rem; padding: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.9rem; }
.score { font-weight: 700; margin: 0.6rem 0 0; min-height: 1.4em; }
@container (max-width: 420px) {
  .sorter { padding: 0.85rem; }
  .steps li { grid-template-columns: 1.4rem 1fr; }
  .steps .moves { grid-column: 2; }
}
`;

let sheet: CSSStyleSheet | null = null;
function sheets(): CSSStyleSheet[] | null {
  try {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(uiCss + css);
    }
    return [sheet];
  } catch {
    return null;
  }
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class SorterElement extends HTMLElement {
  private root: ShadowRoot;
  private cfg!: SorterConfig;
  /** Categories: display order of cards, and where each card is (bin id or null) */
  private cardOrder: number[] = [];
  private placement: (string | null)[] = [];
  private picked: number | null = null;
  private checked = false;
  /** Order mode: order[pos] = item index */
  private order: number[] = [];
  private seed = 1;
  private live!: HTMLElement;
  private built = false;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const s = sheets();
    if (s) this.root.adoptedStyleSheets = s;
    else {
      const style = document.createElement('style');
      style.textContent = uiCss + css;
      this.root.append(style);
    }
  }

  connectedCallback(): void {
    if (this.built) return;
    this.built = true;
    try {
      this.cfg = parseConfig(this.getAttribute('data-config'));
    } catch (e) {
      this.root.innerHTML += `<p class="note">${esc(String((e as Error).message))}</p>`;
      return;
    }
    const seedAttr = Number(this.getAttribute('seed'));
    this.seed = Number.isFinite(seedAttr) && seedAttr > 0 ? seedAttr : Math.floor(Math.random() * 1e6) + 1;
    const wrap = document.createElement('div');
    wrap.className = 'sim sorter';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', this.cfg.title ?? (this.cfg.mode === 'order' ? 'Put the steps in order' : 'Sort the cards'));
    wrap.innerHTML = `
      ${this.cfg.title ? `<h3>${esc(this.cfg.title)}</h3>` : ''}
      ${this.cfg.prompt ? `<p class="prompt">${esc(this.cfg.prompt)}</p>` : ''}
      <div class="board"></div>
      <p class="score" aria-live="polite"></p>
      <div class="actions">
        <button type="button" class="primary check">Check</button>
        <button type="button" class="show">Show the answer</button>
        <button type="button" class="again">Start again</button>
      </div>
      <div class="visually-hidden live" aria-live="polite"></div>`;
    this.root.append(wrap);
    this.live = wrap.querySelector('.live') as HTMLElement;
    wrap.querySelector('.check')!.addEventListener('click', () => this.check());
    wrap.querySelector('.show')!.addEventListener('click', () => this.showAnswer());
    wrap.querySelector('.again')!.addEventListener('click', () => this.start(this.seed + 101));
    this.start(this.seed);
  }

  /** Reset to a fresh shuffle. */
  start(seed = this.seed): void {
    this.seed = seed;
    this.checked = false;
    this.picked = null;
    const n = this.cfg.items.length;
    if (this.cfg.mode === 'order') this.order = scrambledOrder(n, seed);
    else {
      this.cardOrder = shuffle(
        Array.from({ length: n }, (_, i) => i),
        seed,
      );
      this.placement = Array(n).fill(null);
    }
    this.setScore('');
    this.draw();
  }

  private setScore(text: string) {
    (this.root.querySelector('.score') as HTMLElement).textContent = text;
  }

  private say(text: string) {
    this.live.textContent = text;
  }

  private board(): HTMLElement {
    return this.root.querySelector('.board') as HTMLElement;
  }

  private draw(focusKey?: string) {
    if (this.cfg.mode === 'order') this.drawOrder();
    else this.drawCategories();
    if (focusKey) (this.root.querySelector(`[data-key="${focusKey}"]`) as HTMLElement | null)?.focus();
  }

  // ---------- Categories ----------

  private drawCategories() {
    const { items, bins = [] } = this.cfg;
    const result = this.checked ? checkCategories(items, this.placement) : null;
    const cardBtn = (i: number) => {
      const mark = result && result.marks[i] !== null ? `<span class="mark ${result.marks[i] ? 'ok' : 'no'}" aria-hidden="true">${result.marks[i] ? '✓' : '✗'}</span>` : '';
      const status = result && result.marks[i] !== null ? (result.marks[i] ? ' (right)' : ' (wrong)') : '';
      return `<button type="button" class="card" data-key="c${i}" data-card="${i}" aria-pressed="${this.picked === i}" aria-label="${esc(items[i].text + status)}">${mark}${esc(items[i].text)}</button>`;
    };
    const tray = this.cardOrder.filter((i) => this.placement[i] === null);
    const pickedText = this.picked !== null ? items[this.picked].text : '';
    this.board().innerHTML = `
      <p class="tray-label" id="tray-label">Cards to sort</p>
      <div class="tray" role="group" aria-labelledby="tray-label">
        ${tray.length ? tray.map(cardBtn).join('') : '<span class="tray-empty">All cards are placed. Press Check.</span>'}
      </div>
      <div class="bins">
        ${bins
          .map((b) => {
            const inBin = this.cardOrder.filter((i) => this.placement[i] === b.id);
            return `<section class="bin" aria-label="${esc(b.label)}">
              <div class="bin-head">
                <span class="bin-title">${esc(b.label)}</span>
                <button type="button" class="place" data-key="b${esc(b.id)}" data-bin="${esc(b.id)}" ${this.picked === null ? 'disabled' : ''}
                  aria-label="${this.picked === null ? `Pick a card first, then place it in ${esc(b.label)}` : `Place “${esc(pickedText)}” in ${esc(b.label)}`}">Place here</button>
              </div>
              <ul>
                ${inBin
                  .map((i) => {
                    const fb =
                      result && result.marks[i] !== null
                        ? `<p class="fb ${result.marks[i] ? 'ok' : 'no'}">${result.marks[i] ? 'Right.' : `Not quite: this belongs in “${esc(bins.find((x) => x.id === items[i].bin)?.label ?? '')}”.`} ${esc(items[i].explain ?? '')}</p>`
                        : '';
                    return `<li>${cardBtn(i)}${fb}</li>`;
                  })
                  .join('')}
              </ul>
            </section>`;
          })
          .join('')}
      </div>`;
    this.board()
      .querySelectorAll<HTMLButtonElement>('.card')
      .forEach((b) => b.addEventListener('click', (e) => this.pick(Number(b.dataset.card), e.detail === 0)));
    this.board()
      .querySelectorAll<HTMLButtonElement>('.place')
      .forEach((b) => b.addEventListener('click', () => this.place(b.dataset.bin!)));
  }

  private pick(i: number, viaKeyboard = false) {
    this.picked = this.picked === i ? null : i;
    // Keyboard users go straight to the first box's button; Tab moves on to the other boxes.
    const first = this.cfg.bins?.[0]?.id;
    this.draw(this.picked !== null && viaKeyboard && first ? `b${first}` : `c${i}`);
    if (this.picked !== null) this.say(`Picked: ${this.cfg.items[i].text}. Now choose a box with its Place here button.`);
  }

  private place(bin: string) {
    if (this.picked === null) return;
    const i = this.picked;
    this.placement[i] = bin;
    this.picked = null;
    this.checked = false;
    this.setScore('');
    const label = this.cfg.bins?.find((b) => b.id === bin)?.label ?? bin;
    // Keep keyboard users moving: focus the next card still in the tray, or the Check button.
    const next = this.cardOrder.find((k) => this.placement[k] === null);
    this.draw(next !== undefined ? `c${next}` : undefined);
    if (next === undefined) (this.root.querySelector('.check') as HTMLElement).focus();
    this.say(`Placed in ${label}.`);
  }

  // ---------- Order ----------

  private drawOrder() {
    const { items } = this.cfg;
    const n = items.length;
    const allRight = this.checked && inPlaceCount(this.order) === n;
    this.board().innerHTML = `<ol class="steps">${this.order
      .map((item, pos) => {
        const state = this.checked ? (item === pos ? 'ok' : 'no') : '';
        const mark = state ? `<span class="mark ${state}" aria-hidden="true">${state === 'ok' ? '✓' : '✗'}</span>` : '';
        const explain = allRight && items[item].explain ? `<small>${esc(items[item].explain!)}</small>` : '';
        const t = esc(items[item].text);
        return `<li class="${state}">
          <span class="num" aria-hidden="true">${pos + 1}</span>
          <span class="text">${mark}${t}${state ? `<span class="visually-hidden">${state === 'ok' ? ' (in the right place)' : ' (not in the right place)'}</span>` : ''}${explain}</span>
          <span class="moves">
            <button type="button" data-key="u${item}" data-pos="${pos}" data-dir="-1" aria-label="Move up: ${t}" ${pos === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" data-key="d${item}" data-pos="${pos}" data-dir="1" aria-label="Move down: ${t}" ${pos === n - 1 ? 'disabled' : ''}>↓</button>
          </span>
        </li>`;
      })
      .join('')}</ol>`;
    this.board()
      .querySelectorAll<HTMLButtonElement>('.moves button')
      .forEach((b) =>
        b.addEventListener('click', () => {
          const pos = Number(b.dataset.pos);
          const dir = Number(b.dataset.dir) as -1 | 1;
          const item = this.order[pos];
          this.order = move(this.order, pos, dir);
          this.checked = false;
          this.setScore('');
          const newPos = pos + dir;
          // Keep focus on the same button of the moved step, or the other one at an end.
          let key = `${dir < 0 ? 'u' : 'd'}${item}`;
          if ((dir < 0 && newPos === 0) || (dir > 0 && newPos === n - 1)) key = `${dir < 0 ? 'd' : 'u'}${item}`;
          this.draw(key);
          this.say(`Moved to position ${newPos + 1} of ${n}.`);
        }),
      );
  }

  // ---------- Shared ----------

  check(): void {
    this.checked = true;
    this.picked = null;
    if (this.cfg.mode === 'order') {
      const n = this.cfg.items.length;
      const right = inPlaceCount(this.order);
      this.draw();
      this.setScore(right === n ? `All ${n} steps are in the right order. Well done!` : `${right} of ${n} steps are in the right place. Move the others and check again.`);
    } else {
      const r = checkCategories(this.cfg.items, this.placement);
      this.draw();
      const left = r.total - r.placed;
      this.setScore(
        r.right === r.total
          ? `All ${r.total} cards are in the right place. Well done!`
          : `${r.right} of ${r.placed} placed cards are right${left ? `, and ${left} still to place` : ''}. Read the feedback, move the wrong ones and check again.`,
      );
    }
  }

  showAnswer(): void {
    if (this.cfg.mode === 'order') this.order = this.cfg.items.map((_, i) => i);
    else this.placement = this.cfg.items.map((it) => it.bin ?? null);
    this.check();
  }
}

if (!customElements.get('nc-sorter')) customElements.define('nc-sorter', SorterElement);
