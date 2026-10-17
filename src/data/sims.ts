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
    blurb: 'Diffusion pushes, voltage pulls. Change concentrations and watch the membrane settle at a new resting potential.',
    lessons: ['2.2'],
    chapter: 'neuron',
    status: 'coming',
  },
  {
    slug: 'synapse',
    title: 'Synapse in motion',
    blurb: 'Follow one spike across a synapse, step by step, then add drugs and compare with the same synapse without them.',
    lessons: ['2.5', '2.7'],
    chapter: 'neuron',
    status: 'ready',
    params: ['preset', 'transmitter', 'drug', 'speed', 'predict'],
    youCan: [
      'Step through transmission one event at a time, from calcium entry to recycling.',
      'Switch between excitatory (glutamate, acetylcholine) and inhibitory (GABA) synapses.',
      'Compare a fast ionotropic receptor with a slow metabotropic one (serotonin).',
      'Add an agonist, a receptor blocker, a reuptake or enzyme blocker, or change release.',
      'See every drug against a dashed control trace of the same synapse without it.',
    ],
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

export const readySims = sims.filter((s) => s.status === 'ready');
export const comingSims = sims.filter((s) => s.status === 'coming');

export function simBySlug(slug: string): SimInfo | undefined {
  return sims.find((s) => s.slug === slug);
}
