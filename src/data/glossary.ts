/**
 * Glossary. Each entry appears on /toolbox/glossary/ and as a pop-up wherever a lesson
 * uses <Term id="...">. Keep definitions to one or two plain sentences.
 */

export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
  /** Where the word comes from, when that helps it stick */
  roots?: string;
  /** Lesson numbers that teach it */
  lessons?: string[];
}

export const glossary: GlossaryEntry[] = [
  {
    id: 'action-potential',
    term: 'action potential',
    definition:
      'A brief, all-or-none reversal of the voltage across a neuron’s membrane that travels down the axon. Also called a spike.',
    lessons: ['2.3'],
  },
  {
    id: 'all-or-none',
    term: 'all-or-none',
    definition:
      'A stimulus that reaches threshold produces a full-sized action potential; one that falls short produces none. A stronger stimulus raises the firing rate, not the size of each spike.',
    lessons: ['2.3'],
  },
  {
    id: 'depolarisation',
    term: 'depolarisation',
    definition: 'A change in membrane voltage towards zero or above, making the inside less negative.',
    roots: 'de- (away from) + polarisation: the membrane loses some of its charge difference.',
    lessons: ['2.2', '2.3'],
  },
  {
    id: 'repolarisation',
    term: 'repolarisation',
    definition: 'The return of the membrane voltage towards its negative resting value after a depolarisation.',
    lessons: ['2.3'],
  },
  {
    id: 'hyperpolarisation',
    term: 'hyperpolarisation',
    definition: 'A change in membrane voltage that makes the inside more negative than at rest.',
    roots: 'hyper- (beyond) + polarisation.',
    lessons: ['2.3'],
  },
  {
    id: 'threshold',
    term: 'threshold',
    definition:
      'The membrane voltage at which enough voltage-gated sodium channels open for the depolarisation to feed itself and an action potential to follow.',
    lessons: ['2.3'],
  },
  {
    id: 'voltage-gated-channel',
    term: 'voltage-gated channel',
    definition: 'A protein pore in the membrane that opens or closes when the voltage across the membrane changes.',
    lessons: ['2.3'],
  },
  {
    id: 'inactivation',
    term: 'inactivation',
    definition:
      'A second gate on the voltage-gated sodium channel that plugs it shortly after it opens, and stays shut until the membrane repolarises.',
    lessons: ['2.3'],
  },
  {
    id: 'refractory-period',
    term: 'refractory period',
    definition:
      'The time after a spike when a second spike is impossible (absolute) or needs a stronger stimulus (relative), because sodium channels are still inactivated and potassium channels still open.',
    roots: 'Latin refractarius, stubborn.',
    lessons: ['2.3'],
  },
  {
    id: 'undershoot',
    term: 'undershoot',
    definition:
      'The short dip below the resting potential at the end of a spike, caused by potassium channels that are slow to close. Also called the after-hyperpolarisation.',
    lessons: ['2.3'],
  },
  {
    id: 'equilibrium-potential',
    term: 'equilibrium potential',
    definition:
      'The voltage at which an ion’s electrical pull exactly balances its concentration push, so it has no net flow. About +50 mV for sodium and −77 mV for potassium in the squid axon model.',
    lessons: ['2.2', '2.3'],
  },
  {
    id: 'conductance',
    term: 'conductance',
    definition:
      'How easily an ion can cross the membrane, set by how many of its channels are open. The opposite of resistance.',
    lessons: ['2.3'],
  },
  {
    id: 'tetrodotoxin',
    term: 'tetrodotoxin (TTX)',
    definition: 'A toxin from pufferfish and some other animals that blocks voltage-gated sodium channels from the outside.',
    roots: 'Tetraodontiformes, the order of fish that includes pufferfish.',
    lessons: ['2.3'],
  },
  {
    id: 'tetraethylammonium',
    term: 'tetraethylammonium (TEA)',
    definition: 'A laboratory chemical that blocks many voltage-gated potassium channels.',
    lessons: ['2.3'],
  },
  {
    id: 'axon-hillock',
    term: 'axon hillock',
    definition: 'The cone-shaped region where the axon leaves the cell body; spikes usually start just beyond it.',
    roots: 'hillock: a small hill.',
    lessons: ['2.1', '2.6'],
  },
  {
    id: 'lateral-inhibition',
    term: 'lateral inhibition',
    definition:
      'Neighbouring cells suppressing each other’s activity, so differences between neighbours are exaggerated and edges stand out.',
    roots: 'lateral: sideways.',
    lessons: ['6.4'],
  },
  {
    id: 'mach-bands',
    term: 'Mach bands',
    definition:
      'Light and dark stripes that we see at the edges of a brightness ramp although they are not in the image. Named after Ernst Mach, who described them in 1865.',
    lessons: ['6.4'],
  },
  {
    id: 'receptive-field',
    term: 'receptive field',
    definition: 'The region of the sensory surface (for example, a patch of retina) where a stimulus changes a neuron’s firing.',
    lessons: ['6.4'],
  },
];

export function getTerm(id: string): GlossaryEntry | undefined {
  return glossary.find((g) => g.id === id);
}
