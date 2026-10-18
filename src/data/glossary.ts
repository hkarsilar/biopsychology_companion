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
    id: 'astrocyte',
    term: 'astrocyte',
    definition:
      'A star-shaped glial cell of the brain and spinal cord. It links neurons to blood vessels, clears spare potassium and neurotransmitter, wraps synapses and helps clean up debris.',
    roots: 'Greek astron, star + kytos, cell.',
    lessons: ['2.1'],
  },
  {
    id: 'axon',
    term: 'axon',
    definition:
      'The single long extension that carries action potentials away from a neuron’s cell body to its terminal buttons. It can be shorter than a millimetre or about a metre long.',
    lessons: ['2.1', '2.4'],
  },
  {
    id: 'bipolar-neuron',
    term: 'bipolar neuron',
    definition:
      'A neuron with one dendrite and one axon on opposite sides of the cell body, such as the smell neurons in the nose.',
    lessons: ['2.1'],
  },
  {
    id: 'central-nervous-system',
    term: 'central nervous system (CNS)',
    definition:
      'The brain and the spinal cord: the parts of the nervous system enclosed by the skull and the spine.',
    lessons: ['2.1'],
  },
  {
    id: 'concentration-gradient',
    term: 'concentration gradient',
    definition:
      'A difference in how crowded a substance is between two places, such as inside and outside a cell. Diffusion pushes particles down the gradient.',
    lessons: ['2.2'],
  },
  {
    id: 'conduction-velocity',
    term: 'conduction velocity',
    definition:
      'How fast an action potential travels along an axon, from under 1 m/s in thin bare axons to over 100 m/s in thick myelinated ones.',
    lessons: ['2.4'],
  },
  {
    id: 'dendrite',
    term: 'dendrite',
    definition:
      'A branched extension of a neuron that receives messages from other neurons at synapses and carries them towards the cell body.',
    roots: 'Greek dendron, tree.',
    lessons: ['2.1'],
  },
  {
    id: 'dendritic-spine',
    term: 'dendritic spine',
    definition:
      'A tiny knob on a dendrite where a synapse is made. In the brain most excitatory synapses land on spines, which change shape and number with learning.',
    lessons: ['2.1'],
  },
  {
    id: 'depolarisation',
    term: 'depolarisation',
    definition: 'A change in membrane voltage towards zero or above, making the inside less negative.',
    roots: 'de- (away from) + polarisation: the membrane loses some of its charge difference.',
    lessons: ['2.2', '2.3'],
  },
  {
    id: 'diffusion',
    term: 'diffusion',
    definition:
      'The spreading of particles from where they are crowded to where they are scarce, driven by their random jiggling.',
    lessons: ['2.2'],
  },
  {
    id: 'electrostatic-pressure',
    term: 'electrostatic pressure',
    definition:
      'The pull between opposite charges and the push between like charges. A negative inside attracts positive ions and repels negative ones.',
    lessons: ['2.2'],
  },
  {
    id: 'glia',
    term: 'glia',
    definition:
      'The non-neuronal cells of the nervous system. They make myelin, look after the fluid around neurons, defend against infection and help synapses work. There are roughly as many glia as neurons.',
    roots: 'Greek glia, glue: they were once thought to simply hold neurons together.',
    lessons: ['2.1'],
  },
  {
    id: 'goldman-equation',
    term: 'Goldman equation',
    definition:
      'The formula for the resting potential when several ions can cross at once. Each ion counts in proportion to its permeability and concentrations. Also called the Goldman–Hodgkin–Katz (GHK) equation.',
    lessons: ['2.2'],
  },
  {
    id: 'interneuron',
    term: 'interneuron',
    definition:
      'A neuron that connects other neurons within the brain or spinal cord. Most neurons are interneurons.',
    lessons: ['2.1'],
  },
  {
    id: 'ion',
    term: 'ion',
    definition:
      'An atom or molecule with an electric charge. Positive ions are cations (such as Na⁺ and K⁺); negative ions are anions (such as Cl⁻).',
    lessons: ['2.2'],
  },
  {
    id: 'leak-channel',
    term: 'leak channel',
    definition:
      'An ion channel that stays open at rest. Potassium leak channels are the main reason the resting membrane is inside-negative.',
    lessons: ['2.2'],
  },
  {
    id: 'length-constant',
    term: 'length constant',
    definition:
      'How far a voltage change spreads passively along an axon before it fades to about a third of its size. Thicker and better-insulated axons have longer length constants.',
    lessons: ['2.4'],
  },
  {
    id: 'membrane-potential',
    term: 'membrane potential',
    definition:
      'The voltage across a cell’s membrane: the inside measured relative to the outside, in millivolts.',
    lessons: ['2.2'],
  },
  {
    id: 'microglia',
    term: 'microglia',
    definition:
      'The smallest glial cells and the immune cells of the brain and spinal cord. They swallow debris and microbes and trigger inflammation after damage.',
    lessons: ['2.1'],
  },
  {
    id: 'motor-neuron',
    term: 'motor neuron',
    definition:
      'A neuron that carries commands from the brain and spinal cord to muscles or glands.',
    lessons: ['2.1'],
  },
  {
    id: 'multiple-sclerosis',
    term: 'multiple sclerosis (MS)',
    definition:
      'A disease in which the immune system attacks myelin in the brain and spinal cord. Signals slow down or fail, causing symptoms such as blurred vision, numbness, weakness and fatigue.',
    lessons: ['2.4'],
  },
  {
    id: 'multipolar-neuron',
    term: 'multipolar neuron',
    definition:
      'A neuron with one axon and many dendrites. The most common shape, including motor neurons and most interneurons.',
    lessons: ['2.1'],
  },
  {
    id: 'myelin',
    term: 'myelin',
    definition:
      'Layers of fatty membrane wrapped around an axon by glial cells. It insulates the axon so that action potentials travel much faster.',
    lessons: ['2.1', '2.4'],
  },
  {
    id: 'nernst-equation',
    term: 'Nernst equation',
    definition:
      'The formula for one ion’s equilibrium potential: the voltage at which its electrical pull exactly balances its concentration push.',
    roots: 'Named after Walther Nernst, who derived it in 1889.',
    lessons: ['2.2'],
  },
  {
    id: 'neuron',
    term: 'neuron',
    definition:
      'A nerve cell: the cell type that receives, combines and sends electrical and chemical signals. The human brain has about 86 billion of them.',
    lessons: ['2.1'],
  },
  {
    id: 'node-of-ranvier',
    term: 'node of Ranvier',
    definition:
      'A short bare gap between two myelin segments, crowded with voltage-gated sodium channels. The action potential is rebuilt at each node.',
    roots: 'Named after Louis-Antoine Ranvier, who described the gaps in 1878.',
    lessons: ['2.1', '2.4'],
  },
  {
    id: 'oligodendrocyte',
    term: 'oligodendrocyte',
    definition:
      'A glial cell of the brain and spinal cord that makes myelin. One oligodendrocyte wraps segments of many different axons.',
    roots: 'Greek oligos, few + dendron, tree + kytos, cell: a cell with a few branches.',
    lessons: ['2.1', '2.4'],
  },
  {
    id: 'peripheral-nervous-system',
    term: 'peripheral nervous system (PNS)',
    definition:
      'All the nerves outside the brain and spinal cord, which carry signals between the central nervous system and the rest of the body.',
    lessons: ['2.1'],
  },
  {
    id: 'permeability',
    term: 'permeability',
    definition:
      'How easily an ion can cross a membrane. It depends on how many open channels there are for that ion.',
    lessons: ['2.2'],
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
    id: 'resting-potential',
    term: 'resting potential',
    definition:
      'The membrane potential of a neuron that is not being stimulated, typically about −70 millivolts (inside negative).',
    lessons: ['2.2'],
  },
  {
    id: 'saltatory-conduction',
    term: 'saltatory conduction',
    definition:
      'The way an action potential travels along a myelinated axon: rebuilt at each node of Ranvier, it seems to jump from node to node, which is much faster than in a bare axon.',
    roots: 'Latin saltare, to jump.',
    lessons: ['2.4'],
  },
  {
    id: 'schwann-cell',
    term: 'Schwann cell',
    definition:
      'A glial cell of the peripheral nerves. Each one wraps a single segment of one axon in myelin, and after injury Schwann cells guide the axon as it regrows.',
    lessons: ['2.1', '2.4'],
  },
  {
    id: 'sensory-neuron',
    term: 'sensory neuron',
    definition:
      'A neuron that carries information from the senses into the brain and spinal cord.',
    lessons: ['2.1'],
  },
  {
    id: 'sodium-potassium-pump',
    term: 'sodium-potassium pump',
    definition:
      'A membrane protein that uses energy from ATP to move 3 Na⁺ out of the cell and 2 K⁺ in. It keeps the concentration gradients that the resting potential depends on.',
    lessons: ['2.2'],
  },
  {
    id: 'soma',
    term: 'soma (cell body)',
    definition:
      'The part of a neuron that holds the nucleus and makes the proteins the whole cell needs. Inputs from the dendrites add up here.',
    roots: 'Greek soma, body.',
    lessons: ['2.1'],
  },
  {
    id: 'terminal-button',
    term: 'terminal button',
    definition:
      'The swelling at the end of an axon branch that releases neurotransmitter at a synapse. Also called an axon terminal or synaptic bouton.',
    lessons: ['2.1'],
  },
  {
    id: 'threshold',
    term: 'threshold',
    definition:
      'The membrane voltage at which enough voltage-gated sodium channels open for the depolarisation to feed itself and an action potential to follow.',
    lessons: ['2.3'],
  },
  {
    id: 'unipolar-neuron',
    term: 'unipolar neuron',
    definition:
      'A neuron with one stalk that splits into two branches, one from the skin and one into the spinal cord. Touch and pain neurons have this shape. Also called pseudo-unipolar.',
    lessons: ['2.1'],
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
