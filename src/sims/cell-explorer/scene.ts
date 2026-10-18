/**
 * The drawing for "Meet the cells": one motor neuron in the spinal cord, its axon leaving
 * through a peripheral nerve to a muscle, and the four kinds of glia around it.
 * Drawn from scratch as SVG in a 1000 × 560 box. Colours come from the theme tokens.
 *
 * Every shape that belongs to a part carries data-parts="…" (space separated), so one
 * shape can belong to more than one part (a Schwann cell's wrapping is also myelin).
 */

import type { PartId } from './model';

export const VIEW = { w: 1000, h: 560 };

/** Where each part sits, for zooming in on it. */
export const PART_BOX: Record<PartId, [number, number, number, number]> = {
  dendrite: [40, 160, 290, 340],
  spine: [80, 140, 230, 200],
  soma: [120, 250, 170, 160],
  nucleus: [140, 270, 120, 120],
  hillock: [200, 270, 140, 120],
  axon: [240, 270, 680, 130],
  myelin: [270, 250, 620, 300],
  node: [330, 280, 360, 110],
  terminal: [820, 220, 180, 230],
  synapse: [70, 120, 900, 360],
  astrocyte: [80, 20, 340, 230],
  oligodendrocyte: [260, 290, 320, 250],
  schwann: [560, 270, 320, 120],
  microglia: [20, 440, 220, 120],
};

/** Positions along the signal's path, used by the "follow the signal" animation. */
export const ROUTE = {
  bouton: [126, 168] as const,
  spineHead: [141, 187] as const,
  /** Spine to soma, along the dendrite */
  dendrite: 'M 141 187 L 151 204 C 162 228, 172 255, 182 291',
  soma: [200, 330] as const,
  hillock: [266, 330] as const,
  nodes: [291, 382, 468, 562, 668, 766, 866],
  buttons: [
    [902, 268],
    [902, 306],
    [902, 352],
    [902, 392],
  ] as const,
};

const CNS_SHEATHS: [number, number][] = [
  [300, 378],
  [386, 464],
  [472, 550],
];
const PNS_SHEATHS: [number, number][] = [
  [576, 664],
  [672, 762],
  [770, 856],
];
const NODE_X = [382, 468, 668, 766];

const sheath = (x0: number, x1: number, y: number, color: string, parts: string, extra = '') =>
  `<g data-parts="${parts}" ${extra}>
    <rect x="${x0}" y="${y - 12}" width="${x1 - x0}" height="24" rx="11" fill="${color}" fill-opacity="0.45" stroke="${color}" stroke-width="2"/>
    <line x1="${x0 + 9}" y1="${y - 6}" x2="${x1 - 9}" y2="${y - 6}" stroke="${color}" stroke-opacity="0.55"/>
    <line x1="${x0 + 9}" y1="${y + 6}" x2="${x1 - 9}" y2="${y + 6}" stroke="${color}" stroke-opacity="0.55"/>
  </g>`;

const spine = (x: number, y: number, dx: number, dy: number, parts = 'spine') =>
  `<g data-parts="${parts}"><line x1="${x}" y1="${y}" x2="${x + dx}" y2="${y + dy}" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><circle cx="${x + dx * 1.25}" cy="${y + dy * 1.25}" r="4.5" fill="var(--accent)"/></g>`;

const naDots = (x: number, y: number, n = 3) =>
  Array.from({ length: n }, (_, i) => {
    const xx = x + (i - (n - 1) / 2) * 4;
    return `<circle cx="${xx}" cy="${y - 7}" r="1.8" fill="var(--ion-na)"/><circle cx="${xx}" cy="${y + 7}" r="1.8" fill="var(--ion-na)"/>`;
  }).join('');

export function sceneSvg(): string {
  const neuron = 'var(--accent)';
  const oligo = 'var(--ion-k)';
  const schwann = 'var(--ion-na)';
  const astro = 'var(--good)';
  const micro = 'var(--ion-ca)';
  const y = 330;
  return `
  <defs>
    <radialGradient id="glow">
      <stop offset="0" style="stop-color: var(--warn); stop-opacity: 1"/>
      <stop offset="0.45" style="stop-color: var(--warn); stop-opacity: 0.55"/>
      <stop offset="1" style="stop-color: var(--warn); stop-opacity: 0"/>
    </radialGradient>
  </defs>

  <!-- Regions -->
  <rect x="0" y="0" width="560" height="560" fill="var(--surface-2)" fill-opacity="0.55"/>
  <line x1="562" y1="10" x2="562" y2="550" stroke="var(--text-faint)" stroke-dasharray="6 6"/>
  <text class="region" x="14" y="548">CENTRAL NERVOUS SYSTEM · SPINAL CORD</text>
  <text class="region" x="578" y="548">PERIPHERAL NERVE</text>

  <!-- Capillary with red blood cells -->
  <g class="ctx">
    <rect x="24" y="30" width="512" height="36" rx="18" fill="var(--bad)" fill-opacity="0.14" stroke="var(--bad)" stroke-opacity="0.55" stroke-width="2"/>
    ${[70, 140, 215, 300, 380, 460]
      .map((x, i) => `<ellipse cx="${x}" cy="${48 + (i % 2 ? 3 : -3)}" rx="13" ry="7" fill="var(--bad)" fill-opacity="0.55"/>`)
      .join('')}
    <text class="ctx-label" x="${36}" y="22">blood capillary</text>
  </g>

  <!-- Another neuron's axon arriving at a synapse -->
  <g class="ctx">
    <path d="M 18 120 C 60 128, 96 140, 118 160" fill="none" stroke="var(--text-faint)" stroke-width="5" stroke-linecap="round"/>
    <text class="ctx-label" x="14" y="110">axon of another neuron</text>
  </g>

  <!-- Astrocyte: end-feet on the capillary, an arm wrapped round the synapse -->
  <g data-parts="astrocyte" class="hit">
    <g fill="none" stroke="${astro}" stroke-width="4" stroke-linecap="round">
      <path d="M 262 150 C 250 118, 236 96, 226 72"/>
      <path d="M 262 150 C 284 118, 306 96, 318 72"/>
      <path d="M 262 150 C 226 152, 186 148, 154 154"/>
      <path d="M 262 150 C 300 160, 330 178, 352 196"/>
      <path d="M 262 150 C 286 138, 330 130, 372 124"/>
      <path d="M 262 150 C 254 176, 252 200, 262 222"/>
      <path d="M 262 150 C 240 130, 210 118, 186 112"/>
    </g>
    <path d="M 154 154 C 140 146, 112 146, 106 160 C 100 176, 112 196, 130 200" fill="none" stroke="${astro}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 0"/>
    <ellipse cx="226" cy="70" rx="17" ry="5" fill="${astro}"/>
    <ellipse cx="318" cy="70" rx="17" ry="5" fill="${astro}"/>
    <circle cx="262" cy="150" r="15" fill="${astro}" fill-opacity="0.8" stroke="${astro}" stroke-width="2"/>
  </g>

  <!-- Dendrites -->
  <g data-parts="dendrite" class="hit" fill="none" stroke="${neuron}" stroke-linecap="round">
    <path d="M 182 291 C 172 255, 162 228, 151 204" stroke-width="7"/>
    <path d="M 210 289 C 218 252, 240 226, 274 212" stroke-width="7"/>
    <path d="M 240 228 C 250 206, 252 190, 248 176" stroke-width="4"/>
    <path d="M 156 322 C 124 318, 98 302, 64 296" stroke-width="7"/>
    <path d="M 100 304 C 90 320, 78 334, 56 344" stroke-width="4"/>
    <path d="M 166 362 C 144 392, 122 418, 104 448" stroke-width="7"/>
    <path d="M 134 404 C 116 404, 98 410, 76 418" stroke-width="4"/>
    <path d="M 206 372 C 214 404, 212 436, 222 470" stroke-width="7"/>
    <path d="M 212 420 C 230 430, 244 446, 252 462" stroke-width="4"/>
  </g>
  <g>
    ${spine(151, 204, -6, -11, 'spine synapse')}
    ${spine(166, 240, -11, 3)}
    ${spine(246, 222, 4, -11)}
    ${spine(248, 182, 10, -2)}
    ${spine(84, 300, -2, -11)}
    ${spine(118, 312, 2, 11)}
    ${spine(72, 340, -4, -10)}
    ${spine(126, 418, 11, 4)}
    ${spine(90, 414, -3, -11)}
    ${spine(214, 444, -11, 3)}
    ${spine(240, 444, 9, -6)}
  </g>

  <!-- Incoming synapse: terminal button of the other neuron, next to a spine -->
  <g data-parts="synapse" class="hit">
    <circle cx="${ROUTE.bouton[0]}" cy="${ROUTE.bouton[1]}" r="11" fill="var(--text-faint)" fill-opacity="0.8" stroke="var(--text-muted)" stroke-width="1.5"/>
    <circle cx="122" cy="165" r="2.2" fill="var(--surface)"/><circle cx="129" cy="163" r="2.2" fill="var(--surface)"/><circle cx="127" cy="171" r="2.2" fill="var(--surface)"/>
  </g>

  <!-- Cell body, nucleus, axon hillock -->
  <g data-parts="soma" class="hit">
    <path d="M 160 312 C 164 286, 196 278, 222 290 C 244 300, 252 322, 244 344 C 236 368, 206 380, 182 370 C 158 360, 156 334, 160 312 Z" fill="${neuron}" fill-opacity="0.28" stroke="${neuron}" stroke-width="3"/>
  </g>
  <g data-parts="nucleus soma" class="hit">
    <circle cx="198" cy="330" r="18" fill="${neuron}" fill-opacity="0.35" stroke="${neuron}" stroke-width="2"/>
    <circle cx="203" cy="325" r="5" fill="${neuron}"/>
  </g>
  <g data-parts="hillock" class="hit">
    <path d="M 242 312 C 256 322, 270 326, 284 327 L 284 333 C 270 334, 256 338, 242 348 Z" fill="${neuron}" fill-opacity="0.5" stroke="${neuron}" stroke-width="2.5" stroke-linejoin="round"/>
    ${naDots(292, y, 3)}
  </g>

  <!-- Axon: one long line, with the myelin on top -->
  <g data-parts="axon" class="hit">
    <line x1="282" y1="${y}" x2="868" y2="${y}" stroke="${neuron}" stroke-width="6" stroke-linecap="round"/>
  </g>

  <!-- Oligodendrocyte: one cell, arms to several axons -->
  <g data-parts="oligodendrocyte" class="hit">
    <g fill="none" stroke="${oligo}" stroke-width="3" stroke-linecap="round">
      <path d="M 426 430 C 400 400, 352 380, 340 343"/>
      <path d="M 426 430 C 424 400, 424 372, 425 343"/>
      <path d="M 426 430 C 456 400, 500 380, 511 343"/>
      <path d="M 426 430 C 404 452, 378 470, 372 492"/>
      <path d="M 426 430 C 450 452, 474 470, 482 492"/>
    </g>
    <circle cx="426" cy="430" r="17" fill="${oligo}" fill-opacity="0.75" stroke="${oligo}" stroke-width="2"/>
    <circle cx="426" cy="430" r="6" fill="var(--surface)" fill-opacity="0.6"/>
  </g>

  <!-- Neighbouring axons of other neurons, myelinated by the same oligodendrocyte -->
  <g class="ctx">
    <line x1="250" y1="504" x2="556" y2="504" stroke="var(--text-faint)" stroke-width="5" stroke-linecap="round"/>
    <text class="ctx-label" x="252" y="534">axons of other neurons</text>
  </g>
  ${sheath(330, 414, 504, oligo, 'myelin oligodendrocyte', 'class="hit"')}
  ${sheath(440, 524, 504, oligo, 'myelin oligodendrocyte', 'class="hit"')}

  ${CNS_SHEATHS.map(([a, b]) => sheath(a, b, y, oligo, 'myelin oligodendrocyte', 'class="hit"')).join('')}
  ${PNS_SHEATHS.map(
    ([a, b]) =>
      `${sheath(a, b, y, schwann, 'myelin schwann', 'class="hit"')}
      <g data-parts="schwann" class="hit"><ellipse cx="${(a + b) / 2}" cy="${y - 16}" rx="15" ry="7" fill="${schwann}" fill-opacity="0.85" stroke="${schwann}" stroke-width="1.5"/></g>`,
  ).join('')}

  <!-- Nodes of Ranvier: bare gaps full of sodium channels -->
  ${NODE_X.map(
    (x) => `<g data-parts="node axon" class="hit"><rect x="${x - 10}" y="${y - 16}" width="20" height="32" fill="transparent"/>${naDots(x, y, 2)}</g>`,
  ).join('')}
  <g data-parts="node axon" class="hit"><rect x="${552}" y="${y - 16}" width="22" height="32" fill="transparent"/>${naDots(563, y, 3)}</g>

  <!-- Muscle fibre -->
  <g class="ctx">
    <rect x="910" y="190" width="74" height="280" rx="20" fill="var(--membrane)" fill-opacity="0.5" stroke="var(--membrane-edge)" stroke-width="2"/>
    ${Array.from({ length: 31 }, (_, i) => `<line x1="916" x2="978" y1="${200 + i * 8.6}" y2="${200 + i * 8.6}" stroke="var(--membrane-edge)" stroke-opacity="${i % 2 ? 0.25 : 0.5}"/>`).join('')}
    <text class="ctx-label" x="946" y="490" text-anchor="middle">muscle fibre</text>
  </g>
  <g class="muscle-flash" opacity="0"><rect x="910" y="190" width="74" height="280" rx="20" fill="var(--warn)" fill-opacity="0.35"/></g>

  <!-- Axon terminals and terminal buttons, forming synapses on the muscle -->
  <g data-parts="terminal" class="hit" fill="none" stroke="${neuron}" stroke-width="4" stroke-linecap="round">
    ${ROUTE.buttons.map(([bx, by]) => `<path d="M 866 ${y} C 882 ${y}, 884 ${by}, ${bx - 6} ${by}"/>`).join('')}
  </g>
  ${ROUTE.buttons
    .map(
      ([bx, by]) =>
        `<g data-parts="terminal synapse" class="hit"><circle cx="${bx}" cy="${by}" r="7.5" fill="${neuron}" fill-opacity="0.7" stroke="${neuron}" stroke-width="2"/></g>`,
    )
    .join('')}

  <!-- Microglia with fine arms, near some debris -->
  <g class="ctx">
    ${[
      [148, 512],
      [160, 522],
      [140, 528],
      [168, 506],
    ]
      .map(([x, yy], i) => `<path d="M ${x} ${yy} l 4 -3 l 3 4 l -5 3 z" fill="var(--text-faint)" fill-opacity="${0.5 + i * 0.1}"/>`)
      .join('')}
  </g>
  <g data-parts="microglia" class="hit">
    <g fill="none" stroke="${micro}" stroke-width="2" stroke-linecap="round">
      <path d="M 90 506 l -22 -14 l -8 -10 M 76 496 l -10 6"/>
      <path d="M 90 506 l 24 -12 l 12 -12 M 108 497 l 10 6"/>
      <path d="M 90 506 l 30 10 l 14 -2 M 116 515 l 6 10"/>
      <path d="M 90 506 l -18 18 l -14 4 M 78 518 l -2 12"/>
      <path d="M 90 506 l 2 -24 l -6 -10"/>
    </g>
    <ellipse cx="90" cy="506" rx="10" ry="8" fill="${micro}" fill-opacity="0.85" stroke="${micro}" stroke-width="1.5"/>
  </g>

  <!-- Labels -->
  <g class="labels">
    ${label('dendrite', 'Dendrites', 8, 392, 98, 408, false, 'start')}
    ${label('spine', 'Spines', 8, 262, 80, 287, false, 'start')}
    ${label('synapse', 'Synapse', 66, 196, 116, 176)}
    ${label('soma', 'Cell body', 254, 398, 236, 358, false, 'start')}
    ${label('nucleus', 'Nucleus', 150, 285, 192, 318, false, 'end')}
    ${label('hillock', 'Axon hillock', 262, 296, 262, 320)}
    ${label('axon', 'Axon', 600, 376, 566, 334, false, 'start')}
    ${label('myelin', 'Myelin', 340, 300, 340, 318)}
    ${label('node', 'Node of Ranvier', 468, 288, 468, 316)}
    ${label('terminal', 'Terminal buttons', 852, 236, 896, 264, false, 'end')}
    ${label('synapse', 'Synapse onto muscle', 852, 430, 900, 396, false, 'end')}
    ${label('astrocyte', 'Astrocyte', 296, 190, 268, 160, false, 'start')}
    ${label('oligodendrocyte', 'Oligodendrocyte', 446, 446, 440, 436, false, 'start')}
    ${label('schwann', 'Schwann cell', 620, 288, 620, 306)}
    ${label('microglia', 'Microglia', 106, 476, 92, 496, false, 'start')}
  </g>

  <!-- Signal animation layer -->
  <g class="signal" aria-hidden="true">
    <path class="route-dend" d="${ROUTE.dendrite}" fill="none" stroke="none"/>
    <g class="transmitter"></g>
    <circle class="sig-ring" cx="${ROUTE.soma[0]}" cy="${ROUTE.soma[1]}" r="0" fill="none" stroke="var(--warn)" stroke-width="3" opacity="0"/>
    <path class="sig-trail" d="" fill="none" stroke="var(--warn)" stroke-width="2" stroke-dasharray="3 5" opacity="0"/>
    <circle class="sig" cx="0" cy="0" r="16" fill="url(#glow)" opacity="0"/>
  </g>`;
}

function label(part: string, text: string, x: number, y: number, lx: number, ly: number, hidden = false, anchor: 'start' | 'middle' | 'end' = 'middle'): string {
  if (hidden) return `<g data-parts="${part}" class="lbl"><text x="${x}" y="${y}" text-anchor="${anchor}">${text}</text></g>`;
  // Start the leader line at the end of the text nearest the target (text width estimated).
  const w = text.length * 8.2;
  const sx = anchor === 'start' && lx > x + w ? x + w + 4 : x;
  const sy = anchor === 'start' && lx > x + w ? y - 5 : y + 4;
  return `<g data-parts="${part}" class="lbl">
    <line x1="${sx}" y1="${sy}" x2="${lx}" y2="${ly}" />
    <text x="${x}" y="${y}" text-anchor="${anchor}">${text}</text>
  </g>`;
}

/** Small drawings for the "Neuron shapes" tab, each 300 × 200. Arrows show which way signals flow. */
export function shapeSvg(id: 'multipolar' | 'bipolar' | 'unipolar'): string {
  const c = 'var(--accent)';
  const arrow = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--warn)" stroke-width="2.5" marker-end="url(#arr-${id})"/>`;
  const defs = `<defs><marker id="arr-${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--warn)"/></marker></defs>`;
  if (id === 'multipolar')
    return `${defs}
      <g fill="none" stroke="${c}" stroke-linecap="round">
        <path d="M 70 92 C 50 70, 40 52, 22 40" stroke-width="5"/><path d="M 44 60 L 30 66" stroke-width="3"/>
        <path d="M 76 86 C 76 60, 84 40, 92 20" stroke-width="5"/>
        <path d="M 66 108 C 46 116, 32 130, 16 140" stroke-width="5"/><path d="M 40 122 L 34 104" stroke-width="3"/>
        <path d="M 80 118 C 78 140, 70 160, 60 182" stroke-width="5"/>
        <path d="M 112 102 L 290 102" stroke-width="4"/>
        <path d="M 270 102 C 278 102, 280 82, 290 80 M 270 102 C 278 102, 280 122, 290 124" stroke-width="3"/>
      </g>
      <circle cx="84" cy="102" r="26" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="3"/>
      <circle cx="84" cy="102" r="10" fill="${c}" fill-opacity="0.5"/>
      ${arrow(140, 86, 200, 86)}
      <text class="sh-lbl" x="150" y="126">axon</text><text class="sh-lbl" x="100" y="186">dendrites</text>`;
  if (id === 'bipolar')
    return `${defs}
      <g fill="none" stroke="${c}" stroke-linecap="round">
        <path d="M 126 102 L 36 102" stroke-width="5"/>
        <path d="M 36 102 L 18 86 M 36 102 L 16 104 M 36 102 L 20 120" stroke-width="3"/>
        <path d="M 174 102 L 284 102" stroke-width="4"/>
        <path d="M 270 102 L 290 88 M 270 102 L 290 116" stroke-width="3"/>
      </g>
      <ellipse cx="150" cy="102" rx="26" ry="20" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="3"/>
      <circle cx="150" cy="102" r="8" fill="${c}" fill-opacity="0.5"/>
      ${arrow(60, 82, 110, 82)}${arrow(190, 82, 250, 82)}
      <text class="sh-lbl" x="34" y="140">dendrite</text><text class="sh-lbl" x="210" y="140">axon</text>`;
  return `${defs}
      <g fill="none" stroke="${c}" stroke-linecap="round">
        <path d="M 150 72 L 150 112" stroke-width="5"/>
        <path d="M 20 112 L 280 112" stroke-width="5"/>
        <path d="M 20 112 L 8 98 M 20 112 L 6 116 M 20 112 L 10 128" stroke-width="3"/>
        <path d="M 280 112 L 294 100 M 280 112 L 294 124" stroke-width="3"/>
      </g>
      <circle cx="150" cy="52" r="24" fill="${c}" fill-opacity="0.3" stroke="${c}" stroke-width="3"/>
      <circle cx="150" cy="52" r="8" fill="${c}" fill-opacity="0.5"/>
      ${arrow(40, 132, 120, 132)}${arrow(180, 132, 260, 132)}
      <text class="sh-lbl" x="18" y="160">from the skin</text><text class="sh-lbl" x="196" y="160">to spinal cord</text>
      <text class="sh-lbl" x="182" y="34">cell body sits</text><text class="sh-lbl" x="182" y="50">in a dorsal root</text><text class="sh-lbl" x="182" y="66">ganglion</text>`;
}
