/**
 * Meet the cells: the parts of a neuron and the four kinds of glia, what each one does,
 * and where it fits in the journey of a signal through one motor neuron.
 */

export type PartId =
  | 'dendrite'
  | 'spine'
  | 'soma'
  | 'nucleus'
  | 'hillock'
  | 'axon'
  | 'myelin'
  | 'node'
  | 'terminal'
  | 'synapse'
  | 'astrocyte'
  | 'oligodendrocyte'
  | 'schwann'
  | 'microglia';

export interface Part {
  id: PartId;
  name: string;
  group: 'neuron' | 'glia';
  /** Where this kind of cell or part is found */
  where: string;
  /** What it does, in plain words */
  job: string;
  /** Its place in the signal's journey through the neuron */
  journey: string;
}

export const PARTS: Part[] = [
  {
    id: 'dendrite',
    name: 'Dendrites',
    group: 'neuron',
    where: 'Part of the neuron',
    job: 'Branches that collect messages. Thousands of other neurons can make synapses on one neuron’s dendrites.',
    journey: 'Step 2. Each synapse makes a small change in voltage. It spreads along the dendrite towards the cell body and fades as it goes.',
  },
  {
    id: 'spine',
    name: 'Dendritic spines',
    group: 'neuron',
    where: 'Part of the neuron',
    job: 'Tiny knobs on the dendrites. In the brain, most excitatory synapses land on a spine. Spines grow, shrink and change shape as we learn.',
    journey: 'Step 1. The message from another neuron arrives here, at a synapse on a spine.',
  },
  {
    id: 'soma',
    name: 'Cell body (soma)',
    group: 'neuron',
    where: 'Part of the neuron',
    job: 'Holds the nucleus and the machinery that keeps the cell alive. It makes the proteins, membrane and fuel for the whole neuron, right out to the tips of the axon.',
    journey: 'Step 3. Voltage changes from all the dendrites meet here and add up.',
  },
  {
    id: 'nucleus',
    name: 'Nucleus',
    group: 'neuron',
    where: 'Inside the cell body',
    job: 'Holds the DNA: the recipes for every protein the neuron makes, including its ion channels and receptors.',
    journey: 'Not a relay on the path. The nucleus is the control centre, not a station the signal passes through. Very active neurons do switch genes on and off here, which is one way that learning lasts.',
  },
  {
    id: 'hillock',
    name: 'Axon hillock',
    group: 'neuron',
    where: 'Part of the neuron',
    job: 'The cone where the axon leaves the cell body. The stretch just after it is packed with voltage-gated sodium channels, so this is where the neuron is easiest to fire.',
    journey: 'Step 4. The decision point. If the summed voltage here reaches threshold, an action potential fires. If not, nothing is sent.',
  },
  {
    id: 'axon',
    name: 'Axon',
    group: 'neuron',
    where: 'Part of the neuron',
    job: 'One long cable that carries the action potential away from the cell body. A motor neuron’s axon can be about a metre long, from your spinal cord to your foot.',
    journey: 'Step 5. The action potential travels along the axon without getting smaller on the way (all-or-none).',
  },
  {
    id: 'myelin',
    name: 'Myelin sheath',
    group: 'neuron',
    where: 'Wrapped around the axon',
    job: 'Many layers of fatty membrane wrapped around the axon, like insulation on a wire. It is made by glia: oligodendrocytes in the brain and spinal cord, Schwann cells everywhere else.',
    journey: 'Step 5. Under the myelin the current races along inside the axon to the next gap, so the signal travels much faster than in a bare axon.',
  },
  {
    id: 'node',
    name: 'Nodes of Ranvier',
    group: 'neuron',
    where: 'Gaps in the myelin',
    job: 'Short bare gaps between the myelin segments, about 1 µm long and crowded with sodium channels.',
    journey: 'Step 5. The action potential is rebuilt at every node, so it seems to jump from node to node. This is called saltatory conduction, from the Latin for “to jump”.',
  },
  {
    id: 'terminal',
    name: 'Axon terminals (terminal buttons)',
    group: 'neuron',
    where: 'End of the axon',
    job: 'The axon ends in many branches, each with a swelling called a terminal button. Terminal buttons hold tiny packets (vesicles) of neurotransmitter.',
    journey: 'Step 6. When the action potential arrives, the terminal buttons release their neurotransmitter.',
  },
  {
    id: 'synapse',
    name: 'Synapse',
    group: 'neuron',
    where: 'Between two cells',
    job: 'The junction where one cell passes a message to the next. A terminal button releases neurotransmitter across a gap of about 20 nm onto receptors on the other side. You can see two here: one onto a dendritic spine, and one onto a muscle fibre.',
    journey: 'Steps 1 and 6. The journey starts at one synapse and ends at another. The one onto the muscle (the neuromuscular junction) makes the muscle twitch.',
  },
  {
    id: 'astrocyte',
    name: 'Astrocyte',
    group: 'glia',
    where: 'Glial cell · brain and spinal cord',
    job: 'Star-shaped glia. Their end-feet wrap the blood vessels and help pass nutrients to neurons. They mop up spare potassium and neurotransmitter, keep the fluid around neurons just right, hold neurons in place, wrap around synapses to keep them apart and help clean up debris.',
    journey: 'Not a relay on the path, but it keeps the stage set. After a message crosses the synapse, the astrocyte clears away the leftover transmitter, so the next message is crisp.',
  },
  {
    id: 'oligodendrocyte',
    name: 'Oligodendrocyte',
    group: 'glia',
    where: 'Glial cell · brain and spinal cord',
    job: 'Makes the myelin in the brain and spinal cord. One oligodendrocyte sends out many arms, and each arm wraps one segment of an axon. One cell can myelinate segments of dozens of different axons.',
    journey: 'Its myelin makes step 5 fast. In multiple sclerosis the immune system attacks this myelin, and signals slow down or fail.',
  },
  {
    id: 'schwann',
    name: 'Schwann cell',
    group: 'glia',
    where: 'Glial cell · nerves of the body',
    job: 'Makes the myelin outside the brain and spinal cord. Each Schwann cell wraps just one segment of one axon, so a long axon needs hundreds of them. After an injury they clear away the broken axon and form a tube that guides the axon as it regrows.',
    journey: 'Its myelin makes step 5 fast in the nerves of the body. Its help with regrowth is one reason a cut nerve in your arm can recover, while a damaged spinal cord usually cannot.',
  },
  {
    id: 'microglia',
    name: 'Microglia',
    group: 'glia',
    where: 'Glial cell · brain and spinal cord',
    job: 'The smallest glia, and the immune cells of the brain. Their fine arms keep feeling their surroundings. When there is damage or infection they move in, swallow debris and microbes (phagocytosis) and start inflammation. They also prune synapses that are not used.',
    journey: 'Not on the signal’s path. They keep the neighbourhood healthy, which every signal depends on.',
  },
];

export const PART_IDS = PARTS.map((p) => p.id);

export function part(id: PartId): Part {
  const p = PARTS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown part ${id}`);
  return p;
}

export function isPartId(x: string | null | undefined): x is PartId {
  return !!x && (PART_IDS as string[]).includes(x);
}

/** The next or previous part, wrapping round. */
export function stepPart(id: PartId | null, dir: 1 | -1): PartId {
  if (!id) return dir === 1 ? PART_IDS[0] : PART_IDS[PART_IDS.length - 1];
  const i = PART_IDS.indexOf(id);
  return PART_IDS[(i + dir + PART_IDS.length) % PART_IDS.length];
}

export interface Stage {
  part: PartId;
  title: string;
  text: string;
  /** Seconds of animation */
  dur: number;
}

/** "Follow the signal": the journey of one message through a motor neuron to a muscle. */
export const JOURNEY: Stage[] = [
  {
    part: 'synapse',
    title: '1. A message arrives',
    text: 'Another neuron’s terminal button releases neurotransmitter onto a spine.',
    dur: 1.8,
  },
  {
    part: 'dendrite',
    title: '2. The dendrite carries it in',
    text: 'A small change in voltage spreads along the dendrite towards the cell body, fading as it goes.',
    dur: 1.8,
  },
  {
    part: 'soma',
    title: '3. The cell body adds up',
    text: 'Inputs from many synapses meet in the cell body and add up. One input alone is rarely enough.',
    dur: 1.5,
  },
  {
    part: 'hillock',
    title: '4. Decision at the axon hillock',
    text: 'The summed voltage reaches threshold at the axon hillock, and an action potential fires.',
    dur: 1.3,
  },
  {
    part: 'node',
    title: '5. Jumping from node to node',
    text: 'The action potential is rebuilt at each node of Ranvier. The myelin between the nodes makes it fast.',
    dur: 2.6,
  },
  {
    part: 'terminal',
    title: '6. Release at the terminals',
    text: 'The terminal buttons release neurotransmitter onto the muscle fibre, and the muscle twitches.',
    dur: 2.0,
  },
];

export const JOURNEY_LENGTH = JOURNEY.reduce((s, x) => s + x.dur, 0);

/** Which stage is showing at time t (s), and how far through it (0–1). Clamped to the journey. */
export function stageAt(t: number): { index: number; p: number } {
  if (t <= 0) return { index: 0, p: 0 };
  let start = 0;
  for (let i = 0; i < JOURNEY.length; i++) {
    const end = start + JOURNEY[i].dur;
    if (t < end) return { index: i, p: (t - start) / JOURNEY[i].dur };
    start = end;
  }
  return { index: JOURNEY.length - 1, p: 1 };
}

/** Start time of a stage, in seconds. */
export function stageStart(index: number): number {
  return JOURNEY.slice(0, Math.max(0, Math.min(index, JOURNEY.length))).reduce((s, x) => s + x.dur, 0);
}

export type ShapeId = 'multipolar' | 'bipolar' | 'unipolar';
export type RoleId = 'sensory' | 'motor' | 'interneuron';

export interface NeuronShape {
  id: ShapeId;
  name: string;
  alsoCalled?: string;
  text: string;
  examples: string;
  roles: RoleId[];
}

export const SHAPES: NeuronShape[] = [
  {
    id: 'multipolar',
    name: 'Multipolar',
    text: 'One axon and many dendrites. The most common shape in the brain and spinal cord.',
    examples: 'Motor neurons in the spinal cord, and most interneurons in the brain.',
    roles: ['motor', 'interneuron'],
  },
  {
    id: 'bipolar',
    name: 'Bipolar',
    text: 'One dendrite and one axon, leaving from opposite sides of the cell body.',
    examples: 'Smell neurons in the nose, and relay cells in the retina of the eye.',
    roles: ['sensory', 'interneuron'],
  },
  {
    id: 'unipolar',
    name: 'Unipolar',
    alsoCalled: 'pseudo-unipolar',
    text: 'One short stalk leaves the cell body and splits in two. One branch runs out to the skin, the other into the spinal cord. The signal can skip the cell body altogether.',
    examples: 'Touch and pain neurons. Their cell bodies sit in the dorsal root ganglia, just outside the spinal cord.',
    roles: ['sensory'],
  },
];

export const ROLES: Record<RoleId, { name: string; text: string }> = {
  sensory: { name: 'Sensory neuron', text: 'Carries information from the senses into the brain and spinal cord.' },
  motor: { name: 'Motor neuron', text: 'Carries commands from the brain and spinal cord out to muscles and glands.' },
  interneuron: {
    name: 'Interneuron',
    text: 'Connects neurons to each other inside the brain and spinal cord. Most of your neurons are interneurons.',
  },
};
