/**
 * Fun facts for the home page. One is chosen per day in the visitor's browser.
 * Add freely; keep each one checkable and under about 40 words.
 */

export interface FunFact {
  text: string;
  /** Lesson number the fact connects to, if any */
  lesson?: string;
}

export const funFacts: FunFact[] = [
  {
    text: 'The squid giant axon can be up to about a millimetre across, wide enough for Hodgkin and Huxley to slide a wire electrode right inside it.',
    lesson: '2.3',
  },
  {
    text: 'Andrew Huxley solved the action potential equations largely by hand, on a mechanical calculator. Computing one travelling spike took him weeks.',
    lesson: '2.3',
  },
  {
    text: 'Your brain is about 2% of your body weight but uses roughly a fifth of its energy at rest.',
  },
  {
    text: 'The fastest myelinated axons carry signals at up to about 120 metres per second, faster than a car on the motorway.',
    lesson: '2.4',
  },
  {
    text: 'Ernst Mach described the bright and dark bands that bear his name in 1865, decades before anyone could record from a single neuron.',
    lesson: '6.4',
  },
  {
    text: 'H. Keffer Hartline shared the 1967 Nobel Prize, in part for recording from single cells in the eye of the horseshoe crab, where lateral inhibition was first measured.',
    lesson: '6.4',
  },
  {
    text: 'Tetrodotoxin, the pufferfish poison, is thought to be made by bacteria living in the fish rather than by the fish itself.',
    lesson: '2.3',
  },
  {
    text: 'Your cortex has more synapses than there are stars in the Milky Way.',
  },
  {
    text: 'The retina develops from the same tissue as the brain. In a real sense, part of your brain is looking out of your eyes.',
    lesson: '6.2',
  },
  {
    text: 'Each eye has a blind spot where the optic nerve leaves. You never notice it because your brain fills the gap.',
    lesson: '6.1',
  },
  {
    text: 'A resting neuron keeps its inside about 70 millivolts more negative than the outside, about a twentieth of an AA battery.',
    lesson: '2.2',
  },
  {
    text: 'Spikes are all-or-none, so neurons mostly signal “how much” by “how often”: a stronger touch means more spikes per second, not bigger ones.',
    lesson: '2.3',
  },
  {
    text: 'Capybaras are the largest living rodents. An adult can weigh as much as a grown person.',
  },
  {
    text: 'Phineas Gage’s skull and the iron rod that passed through it are on display at Harvard’s Warren Anatomical Museum.',
    lesson: '8.1',
  },
  {
    text: 'Because of the refractory period, most neurons cannot fire more than a few hundred spikes per second.',
    lesson: '2.3',
  },
];
