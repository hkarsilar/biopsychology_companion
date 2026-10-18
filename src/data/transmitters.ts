/**
 * Neurotransmitter cards for lesson 2.7. The big idea: a transmitter is not excitatory or
 * inhibitory by itself. The receptor it binds to decides what happens.
 *
 * "effect" is the overall verdict used by the filter:
 * - excitatory: (almost) all of its receptors excite the cell they are on
 * - inhibitory: (almost) all of its receptors inhibit
 * - depends: it excites at some receptors and inhibits at others
 */

export type TransmitterEffect = 'excitatory' | 'inhibitory' | 'depends';

export interface ReceptorInfo {
  name: string;
  kind: 'ionotropic' | 'metabotropic';
  /** What it usually does to the cell it sits on */
  does: 'excites' | 'inhibits';
  note: string;
}

export interface DrugExample {
  name: string;
  action: string;
}

export interface TransmitterInfo {
  id: string;
  name: string;
  /** Chemical family */
  family: string;
  effect: TransmitterEffect;
  /** One line for the front of the card */
  tagline: string;
  where: string;
  receptors: ReceptorInfo[];
  clearance: string;
  drugs: DrugExample[];
  fact: string;
}

export const transmitters: TransmitterInfo[] = [
  {
    id: 'glutamate',
    name: 'Glutamate',
    family: 'Amino acid',
    effect: 'excitatory',
    tagline: 'The main “go” signal of the brain. Most fast excitatory synapses use it.',
    where: 'Almost everywhere in the brain and spinal cord.',
    receptors: [
      { name: 'AMPA', kind: 'ionotropic', does: 'excites', note: 'Lets Na⁺ in: the fast EPSP.' },
      {
        name: 'NMDA',
        kind: 'ionotropic',
        does: 'excites',
        note: 'Lets Na⁺ and Ca²⁺ in, but only if the membrane is already depolarised enough to push out a blocking Mg²⁺ ion. Important for learning.',
      },
      { name: 'mGluR2 and mGluR3', kind: 'metabotropic', does: 'inhibits', note: 'Sit mostly on presynaptic terminals and turn glutamate release down. Other mGluRs excite.' },
    ],
    clearance: 'Taken back up by transporters on neurons and on astrocytes. Astrocytes turn it into glutamine and hand it back.',
    drugs: [
      { name: 'Ketamine and PCP', action: 'block NMDA receptors' },
      { name: 'Memantine (for Alzheimer’s disease)', action: 'weakly blocks NMDA receptors' },
      { name: 'Alcohol', action: 'dampens NMDA receptors, among other effects' },
    ],
    fact: 'Too much glutamate kills neurons. After a stroke, dying cells spill glutamate that over-excites their neighbours.',
  },
  {
    id: 'gaba',
    name: 'GABA',
    family: 'Amino acid',
    effect: 'inhibitory',
    tagline: 'The main “stop” signal of the adult brain.',
    where: 'Interneurons all over the brain.',
    receptors: [
      { name: 'GABA-A', kind: 'ionotropic', does: 'inhibits', note: 'A Cl⁻ channel: the fast IPSP.' },
      { name: 'GABA-B', kind: 'metabotropic', does: 'inhibits', note: 'Opens K⁺ channels through a G protein: a slow IPSP.' },
    ],
    clearance: 'Taken back up by transporters on neurons and astrocytes, then broken down by an enzyme (GABA transaminase).',
    drugs: [
      { name: 'Benzodiazepines (diazepam)', action: 'make GABA-A receptors respond more strongly to GABA' },
      { name: 'Alcohol and barbiturates', action: 'also boost GABA-A receptors' },
      { name: 'Bicuculline', action: 'blocks GABA-A receptors and causes seizures' },
      { name: 'Baclofen', action: 'activates GABA-B receptors; used for muscle spasms' },
    ],
    fact: 'Neurons make GABA from glutamate in a single step. The brain’s main stop signal is built from its main go signal.',
  },
  {
    id: 'glycine',
    name: 'Glycine',
    family: 'Amino acid',
    effect: 'inhibitory',
    tagline: 'The “stop” signal of the spinal cord and brainstem.',
    where: 'Inhibitory interneurons in the spinal cord and brainstem.',
    receptors: [{ name: 'Glycine receptor', kind: 'ionotropic', does: 'inhibits', note: 'A Cl⁻ channel, like GABA-A.' }],
    clearance: 'Taken back up by transporters.',
    drugs: [
      { name: 'Strychnine', action: 'blocks glycine receptors and causes violent muscle spasms' },
      { name: 'Tetanus toxin', action: 'stops inhibitory interneurons releasing glycine and GABA: lockjaw' },
    ],
    fact: 'Glycine has a second job: the NMDA receptors for glutamate only open if glycine, or its close cousin D-serine, is bound to them too.',
  },
  {
    id: 'acetylcholine',
    name: 'Acetylcholine',
    family: 'Acetylcholine (a family of its own)',
    effect: 'depends',
    tagline: 'Makes your muscles contract, and slows your heart. Same molecule, different receptors.',
    where: 'Every nerve-to-muscle junction, the autonomic nervous system, and brain circuits for attention and memory.',
    receptors: [
      { name: 'Nicotinic', kind: 'ionotropic', does: 'excites', note: 'A channel for Na⁺ (and K⁺). Makes skeletal muscle contract.' },
      { name: 'Muscarinic M2', kind: 'metabotropic', does: 'inhibits', note: 'In the heart, opens K⁺ channels and slows the heartbeat.' },
      { name: 'Muscarinic M1 and M3', kind: 'metabotropic', does: 'excites', note: 'In the brain and in glands and gut muscle.' },
    ],
    clearance: 'Broken down in the cleft by the enzyme acetylcholinesterase. The leftover choline is taken back up to make more.',
    drugs: [
      { name: 'Nicotine', action: 'activates nicotinic receptors' },
      { name: 'Curare (arrow poison)', action: 'blocks nicotinic receptors: paralysis' },
      { name: 'Atropine (deadly nightshade)', action: 'blocks muscarinic receptors: wide pupils, fast heart' },
      { name: 'Botulinum toxin (Botox)', action: 'stops release' },
      { name: 'Nerve agents such as sarin', action: 'block acetylcholinesterase' },
    ],
    fact: 'It was the first neurotransmitter ever discovered: Otto Loewi’s “vagus substance”, which slowed a frog’s heart.',
  },
  {
    id: 'dopamine',
    name: 'Dopamine',
    family: 'Monoamine (catecholamine)',
    effect: 'depends',
    tagline: 'Movement, motivation and learning from reward. Its receptors push in opposite directions.',
    where: 'Mostly made by small groups of neurons in the midbrain, with axons reaching the striatum and the frontal cortex.',
    receptors: [
      { name: 'D1 family (D1, D5)', kind: 'metabotropic', does: 'excites', note: 'Usually makes the target cell more responsive.' },
      { name: 'D2 family (D2, D3, D4)', kind: 'metabotropic', does: 'inhibits', note: 'Usually makes the target cell less responsive. Also an autoreceptor.' },
    ],
    clearance: 'Taken back up by the dopamine transporter, then broken down by MAO and COMT.',
    drugs: [
      { name: 'L-DOPA (for Parkinson’s disease)', action: 'the building block the brain turns into dopamine' },
      { name: 'Cocaine', action: 'blocks the dopamine transporter (and the others for monoamines)' },
      { name: 'Amphetamine', action: 'makes the transporter run backwards, pushing dopamine out' },
      { name: 'Antipsychotics such as haloperidol', action: 'block D2 receptors' },
    ],
    fact: 'Parkinson’s disease symptoms usually appear only after more than half of the midbrain’s dopamine neurons have been lost.',
  },
  {
    id: 'noradrenaline',
    name: 'Noradrenaline',
    family: 'Monoamine (catecholamine)',
    effect: 'depends',
    tagline: 'Alertness and “fight or flight”. Called norepinephrine in American books.',
    where: 'The locus coeruleus in the brainstem, and the sympathetic nerves to your organs.',
    receptors: [
      { name: 'Alpha-1', kind: 'metabotropic', does: 'excites', note: 'For example, tightens blood vessels.' },
      { name: 'Alpha-2', kind: 'metabotropic', does: 'inhibits', note: 'Often an autoreceptor that turns release down.' },
      { name: 'Beta-1', kind: 'metabotropic', does: 'excites', note: 'Speeds up the heart.' },
    ],
    clearance: 'Taken back up by the noradrenaline transporter, then broken down by MAO and COMT.',
    drugs: [
      { name: 'Beta blockers such as propranolol', action: 'block beta receptors; slow the heart, calm stage fright' },
      { name: 'SNRIs such as venlafaxine', action: 'block reuptake of serotonin and noradrenaline' },
      { name: 'Amphetamine', action: 'pushes noradrenaline out of the terminal' },
    ],
    fact: 'The locus coeruleus holds only tens of thousands of neurons, yet its axons reach almost the whole brain.',
  },
  {
    id: 'serotonin',
    name: 'Serotonin (5-HT)',
    family: 'Monoamine (indoleamine)',
    effect: 'depends',
    tagline: 'Mood, sleep and appetite, with at least 14 receptor types.',
    where: 'The raphe nuclei in the brainstem send axons almost everywhere. Most of the body’s serotonin is in the gut.',
    receptors: [
      { name: '5-HT1A', kind: 'metabotropic', does: 'inhibits', note: 'Opens K⁺ channels: a slow IPSP. Also an autoreceptor.' },
      { name: '5-HT2A', kind: 'metabotropic', does: 'excites', note: 'The receptor that LSD and psilocybin act on.' },
      { name: '5-HT3', kind: 'ionotropic', does: 'excites', note: 'The only ionotropic one. Involved in nausea.' },
    ],
    clearance: 'Taken back up by the serotonin transporter, then broken down by MAO.',
    drugs: [
      { name: 'SSRIs such as fluoxetine (Prozac)', action: 'block reuptake' },
      { name: 'MDMA (ecstasy)', action: 'makes the transporter run backwards' },
      { name: 'Ondansetron', action: 'blocks 5-HT3 receptors; stops nausea during chemotherapy' },
      { name: 'MAO inhibitors', action: 'stop the enzyme that breaks it down' },
    ],
    fact: 'About 90 percent of your body’s serotonin is made in the gut, where it helps move food along.',
  },
  {
    id: 'endorphins',
    name: 'Endorphins',
    family: 'Neuropeptide (opioid)',
    effect: 'inhibitory',
    tagline: 'The body’s own painkillers. The name means “morphine from within”.',
    where: 'Released in the brain and spinal cord during pain, stress and hard exercise.',
    receptors: [
      { name: 'Mu, delta and kappa opioid receptors', kind: 'metabotropic', does: 'inhibits', note: 'Open K⁺ channels and reduce transmitter release, for example in pain pathways.' },
    ],
    clearance: 'Broken down by enzymes called peptidases. Peptides are not taken back up and recycled.',
    drugs: [
      { name: 'Morphine, heroin and fentanyl', action: 'activate mu opioid receptors' },
      { name: 'Naloxone', action: 'blocks opioid receptors; reverses an overdose within minutes' },
    ],
    fact: 'Peptides are made in the cell body and shipped down the axon, so a terminal cannot refill its peptide vesicles on the spot.',
  },
  {
    id: 'endocannabinoids',
    name: 'Endocannabinoids',
    family: 'Lipid messenger',
    effect: 'inhibitory',
    tagline: 'Messages that travel backwards, from the receiving cell to the sending terminal.',
    where: 'Made on demand by the postsynaptic cell, all over the brain. Not stored in vesicles.',
    receptors: [
      {
        name: 'CB1',
        kind: 'metabotropic',
        does: 'inhibits',
        note: 'Sits on presynaptic terminals and turns transmitter release down. Quieting an inhibitory terminal can excite the circuit overall.',
      },
    ],
    clearance: 'Taken into cells and broken down by enzymes.',
    drugs: [{ name: 'THC, from cannabis', action: 'activates CB1 receptors' }],
    fact: 'One of them is called anandamide, from the Sanskrit word ananda, meaning bliss.',
  },
];

export const effectLabel: Record<TransmitterEffect, string> = {
  excitatory: 'Excitatory',
  inhibitory: 'Inhibitory',
  depends: 'Depends on the receptor',
};
