/**
 * The simulation lab: every simulation that has its own page at /lab/<slug>/.
 * A simulation with status "ready" gets a page; "coming" ones are listed so students can see what is on the way.
 */

export interface SimInfo {
  slug: string;
  title: string;
  blurb: string;
  /** Lesson numbers that use this simulation */
  lessons: string[];
  chapter: string;
  status: 'ready' | 'coming';
  /** URL parameters the lab page passes on to the element as attributes */
  params?: string[];
  /** What the simulation lets you do, for the lab page */
  youCan?: string[];
}

export const sims: SimInfo[] = [
  {
    slug: 'cell-explorer',
    title: 'Meet the cells',
    blurb: 'Click your way around a neuron and the glial cells that look after it, then follow a signal from dendrite to muscle.',
    lessons: ['2.1'],
    chapter: 'neuron',
    status: 'ready',
    params: ['preset', 'part', 'view'],
    youCan: [
      'Click any part of the neuron to see its job in the signal’s journey.',
      'Meet the four kinds of glia: astrocytes, oligodendrocytes, Schwann cells and microglia.',
      'Follow a signal from a synapse on a dendrite all the way to a muscle.',
      'Compare multipolar, bipolar and pseudo-unipolar neurons.',
    ],
  },
  {
    slug: 'action-potential',
    title: 'Action potential lab',
    blurb: 'Zap a patch of squid axon and watch sodium and potassium channels open, close and lock. Add pufferfish poison and see what breaks.',
    lessons: ['2.3'],
    chapter: 'neuron',
    status: 'ready',
    params: ['preset', 'strength', 'gap', 'hold', 'drugs', 'speed', 'predict'],
    youCan: [
      'Find the threshold by zapping with smaller and bigger currents.',
      'Zap twice and discover the refractory period.',
      'Hold a steady current and turn stimulus strength into firing rate.',
      'Block channels with TTX, TEA or sea anemone toxin.',
      'Slow time down to a quarter of a millisecond per second.',
    ],
  },
  {
    slug: 'resting-builder',
    title: 'Resting potential builder',
    blurb: 'Open and close leak channels for potassium, sodium and chloride, and watch the membrane settle where their pulls balance.',
    lessons: ['2.2'],
    chapter: 'neuron',
    status: 'ready',
    params: ['preset', 'pk', 'pna', 'pcl', 'kout', 'temp', 'pump'],
    youCan: [
      'Make the membrane leak only potassium, only sodium, or a mix.',
      'Raise the potassium outside the cell and watch the neuron depolarise.',
      'Turn the sodium-potassium pump off and fast-forward the hours.',
      'Try the squid giant axon values that Hodgkin and Katz measured.',
    ],
  },
  {
    slug: 'conduction',
    title: 'Conduction race',
    blurb: 'Race spikes down thin, thick and myelinated axons, then strip the myelin off and see what multiple sclerosis does.',
    lessons: ['2.4'],
    chapter: 'neuron',
    status: 'ready',
    params: ['preset', 'lanes', 'damage', 'stim', 'speed', 'predict'],
    youCan: [
      'Race three axons of your choice over one centimetre.',
      'Watch the spike jump from node to node in slow motion.',
      'Damage the myelin on one axon and find the point where conduction fails.',
      'Zap the middle of an axon and watch the spike travel both ways.',
    ],
  },
  {
    slug: 'lateral-inhibition',
    title: 'Lateral inhibition lab',
    blurb: 'Neighbouring cells quiet each other. Draw your own light pattern and watch edges get sharper and illusions appear.',
    lessons: ['6.4'],
    chapter: 'vision',
    status: 'ready',
    params: ['preset', 'mode', 'pattern', 'strength', 'spread', 'feedforward', 'gaze', 'profile', 'electrode', 'predict'],
    youCan: [
      'Shine light on a row of receptors and record from any cell.',
      'Turn inhibition up and down and watch Mach bands appear at edges.',
      'Draw your own light pattern.',
      'Move your gaze over the Hermann grid and see why the grey spots vanish where you look.',
    ],
  },
  {
    slug: 'resting-potential',
    title: 'Ion tug-of-war',
    blurb: 'Diffusion pushes, voltage pulls. Let potassium leak out of a cell and watch the voltage build until the two forces balance.',
    lessons: ['2.2'],
    chapter: 'neuron',
    status: 'ready',
    params: ['preset', 'ion', 'cin', 'cout', 'temp', 'predict'],
    youCan: [
      'Open potassium channels and watch the voltage build up, ion by ion.',
      'See the concentration push and the electrical pull balance at the Nernst potential.',
      'Swap potassium for sodium or chloride and predict where each one settles.',
      'Change the concentrations and the temperature.',
    ],
  },
  {
    slug: 'synapse',
    title: 'Synapse up close',
    blurb: 'Vesicles, receptors and reuptake at a single synapse, with drugs you can drop in.',
    lessons: ['2.5', '2.7'],
    chapter: 'neuron',
    status: 'coming',
  },
  {
    slug: 'perceptron',
    title: 'Perceptron playground',
    blurb: 'Wire a neuron by hand, then let it learn its own weights from examples.',
    lessons: ['3.4'],
    chapter: 'networks',
    status: 'coming',
  },
  {
    slug: 'brain-explorer',
    title: 'Brain explorer',
    blurb: 'Turn, slice and label a 3D brain, one structure at a time.',
    lessons: ['4.5', '4.6', '4.7'],
    chapter: 'anatomy',
    status: 'coming',
  },
  {
    slug: 'receptive-fields',
    title: 'Receptive field mapper',
    blurb: 'Record from a cell in the visual system and map what makes it fire, like Hubel and Wiesel.',
    lessons: ['6.4', '6.7'],
    chapter: 'vision',
    status: 'coming',
  },
  {
    slug: 'two-point',
    title: 'Two-point touch',
    blurb: 'Why your fingertip can tell two pins apart when your back cannot.',
    lessons: ['7.3'],
    chapter: 'touch',
    status: 'coming',
  },
];

/** Lesson numbers in course order: "2.10" comes after "2.9". */
function lessonKey(s: SimInfo): number {
  const [c, l] = (s.lessons[0] ?? '99.99').split('.').map(Number);
  return c * 100 + l;
}

export const readySims = sims.filter((s) => s.status === 'ready').sort((a, b) => lessonKey(a) - lessonKey(b));
export const comingSims = sims.filter((s) => s.status === 'coming');

export function simBySlug(slug: string): SimInfo | undefined {
  return sims.find((s) => s.slug === slug);
}
