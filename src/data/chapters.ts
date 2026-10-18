/**
 * The course map: chapters, the classes they serve and every planned lesson.
 * A lesson becomes a link as soon as its MDX file exists in src/content/lessons/;
 * until then it is listed as "coming".
 */

export interface LessonStub {
  /** Lesson number shown to students, e.g. "2.3" */
  n: string;
  /** URL segment, e.g. "action-potential" */
  slug: string;
  title: string;
}

export interface Chapter {
  n: number | null;
  slug: string;
  title: string;
  short: string;
  classes: string;
  blurb: string;
  extension?: boolean;
  lessons: LessonStub[];
}

export const chapters: Chapter[] = [
  {
    n: 1,
    slug: 'foundations',
    title: 'Foundations',
    short: 'Foundations',
    classes: 'Classes 1–2',
    blurb: 'Why one behaviour has five explanations, and how simple rules build complex brains.',
    lessons: [
      { n: '1.1', slug: 'five-explanations', title: "The frog's five explanations" },
      { n: '1.2', slug: 'levels-and-emergence', title: 'Levels and emergence' },
      { n: '1.3', slug: 'cellular-automata', title: 'Cellular automata' },
      { n: '1.4', slug: 'patterns-from-simple-rules', title: 'Patterns from simple rules' },
    ],
  },
  {
    n: 2,
    slug: 'neuron',
    title: 'The neuron',
    short: 'Neuron',
    classes: 'Classes 3–4',
    blurb: 'How one cell turns a nudge into a spike, and how spikes cross the gap to the next cell.',
    lessons: [
      { n: '2.1', slug: 'cells', title: 'Cells of the nervous system' },
      { n: '2.2', slug: 'resting-potential', title: 'The resting potential' },
      { n: '2.3', slug: 'action-potential', title: 'The action potential' },
      { n: '2.4', slug: 'conduction', title: 'Conduction and myelin' },
      { n: '2.5', slug: 'synapse', title: 'The synapse' },
      { n: '2.6', slug: 'summation', title: 'Integration and summation' },
      { n: '2.7', slug: 'drugs', title: 'Drugs at the synapse' },
    ],
  },
  {
    n: 3,
    slug: 'networks',
    title: 'Neural networks',
    short: 'Networks',
    classes: 'Classes 5–6',
    blurb: 'Neurons as tiny voters: logic, learning and recognition from weights and thresholds.',
    lessons: [
      { n: '3.1', slug: 'detectors', title: 'Neurons as detectors' },
      { n: '3.2', slug: 'logic', title: 'Logic from neurons' },
      { n: '3.3', slug: 'xor', title: 'Hidden layers and XOR' },
      { n: '3.4', slug: 'perceptron', title: 'The perceptron learns' },
      { n: '3.5', slug: 'pixels-to-recognition', title: 'From pixels to recognition' },
      { n: '3.6', slug: 'marr', title: "Marr's levels and connectionism" },
    ],
  },
  {
    n: 4,
    slug: 'anatomy',
    title: 'Neuroanatomy',
    short: 'Anatomy',
    classes: 'Classes 7 and 9',
    blurb: 'A guided tour of the nervous system, from planes and directions to the split brain.',
    lessons: [
      { n: '4.1', slug: 'why-a-nervous-system', title: 'Why have a nervous system?' },
      { n: '4.2', slug: 'directions-and-planes', title: 'Directions and planes' },
      { n: '4.3', slug: 'pns-and-ans', title: 'The PNS and the autonomic system' },
      { n: '4.4', slug: 'protection', title: 'Protection: meninges, CSF and blood supply' },
      { n: '4.5', slug: 'subdivisions', title: 'Subdivisions of the brain' },
      { n: '4.6', slug: 'cortex', title: 'The cortex: lobes, maps and language' },
      { n: '4.7', slug: 'deep-structures', title: 'Deep structures' },
      { n: '4.8', slug: 'brainstem-cerebellum-spinal-cord', title: 'Brainstem, cerebellum and spinal cord' },
      { n: '4.9', slug: 'split-brain', title: 'The split brain' },
    ],
  },
  {
    n: 5,
    slug: 'methods',
    title: 'Methods',
    short: 'Methods',
    classes: 'Class 8 (self-study)',
    blurb: 'How we know what we know: lesions, EEG, scanners and stimulation, and what each can claim.',
    lessons: [
      { n: '5.1', slug: 'phrenology-to-lesions', title: 'From phrenology to lesions' },
      { n: '5.2', slug: 'eeg-erp', title: 'EEG and ERP' },
      { n: '5.3', slug: 'ct-mri-dti', title: 'CT, MRI and DTI' },
      { n: '5.4', slug: 'pet-fmri', title: 'PET, fMRI and subtraction' },
      { n: '5.5', slug: 'tms', title: 'TMS' },
      { n: '5.6', slug: 'choosing-a-method', title: 'Choosing a method' },
    ],
  },
  {
    n: 6,
    slug: 'vision',
    title: 'Vision',
    short: 'Vision',
    classes: 'Classes 10–12',
    blurb: 'From photons to faces: the eye, the retina’s tricks, colour, and the two streams.',
    lessons: [
      { n: '6.1', slug: 'light-and-the-eye', title: 'Light and the eye' },
      { n: '6.2', slug: 'retina', title: 'The retina' },
      { n: '6.3', slug: 'phototransduction', title: 'Phototransduction' },
      { n: '6.4', slug: 'lateral-inhibition', title: 'Receptive fields and lateral inhibition' },
      { n: '6.5', slug: 'colour', title: 'Colour vision' },
      { n: '6.6', slug: 'pathway', title: 'The pathway and visual fields' },
      { n: '6.7', slug: 'v1', title: 'Primary visual cortex' },
      { n: '6.8', slug: 'two-streams', title: 'The two streams' },
      { n: '6.9', slug: 'when-vision-breaks', title: 'When vision breaks' },
    ],
  },
  {
    n: 7,
    slug: 'touch',
    title: 'Touch',
    short: 'Touch',
    classes: 'Class 13',
    blurb: 'Receptors in the skin, two routes to the brain, and maps that change with use.',
    lessons: [
      { n: '7.1', slug: 'somatosenses', title: 'The somatosenses' },
      { n: '7.2', slug: 'mechanoreceptors', title: 'Mechanoreceptors' },
      { n: '7.3', slug: 'acuity', title: 'Acuity' },
      { n: '7.4', slug: 'pathways', title: 'Pathways to the brain' },
      { n: '7.5', slug: 'homunculus', title: 'S1, S2 and the homunculus' },
      { n: '7.6', slug: 'plasticity', title: 'Maps that change' },
      { n: '7.7', slug: 'pain', title: 'Pain (optional)' },
    ],
  },
  {
    n: 8,
    slug: 'emotion',
    title: 'Emotion',
    short: 'Emotion',
    classes: 'Class 14',
    blurb: 'Phineas Gage, theories of emotion, the stress response and how feelings steer decisions.',
    lessons: [
      { n: '8.1', slug: 'phineas-gage', title: 'Phineas Gage' },
      { n: '8.2', slug: 'theories', title: 'Theories of emotion' },
      { n: '8.3', slug: 'stress-response', title: "The body's stress response" },
      { n: '8.4', slug: 'amygdala-and-fear', title: 'The amygdala and fear' },
      { n: '8.5', slug: 'decisions', title: 'Emotion and decisions' },
    ],
  },
  {
    n: 9,
    slug: 'depression',
    title: 'Depression',
    short: 'Depression',
    classes: 'Class 15',
    blurb: 'Mood disorders, stress and the brain, the downward spiral, and how treatments break it.',
    lessons: [
      { n: '9.1', slug: 'mood-disorders', title: 'Mood disorders' },
      { n: '9.2', slug: 'stress-and-hippocampus', title: 'Stress and the hippocampus' },
      { n: '9.3', slug: 'monoamines-and-neurogenesis', title: 'Monoamines and neurogenesis' },
      { n: '9.4', slug: 'downward-spiral', title: 'The downward spiral' },
      { n: '9.5', slug: 'treatments', title: 'Treatments and how they work' },
    ],
  },
  {
    n: null,
    slug: 'hearing',
    title: 'Hearing',
    short: 'Hearing',
    classes: 'Extension',
    blurb: 'Sound, the cochlea and the auditory pathway. Not part of the course, just fascinating.',
    extension: true,
    lessons: [
      { n: 'H.1', slug: 'sound', title: 'Sound' },
      { n: 'H.2', slug: 'cochlea', title: 'The cochlea' },
      { n: 'H.3', slug: 'auditory-pathway', title: 'The auditory pathway' },
      { n: 'H.4', slug: 'hearing-loss', title: 'Hearing loss' },
    ],
  },
  {
    n: null,
    slug: 'prediction',
    title: 'The predictive brain',
    short: 'Prediction',
    classes: 'Extension',
    blurb: 'Perception as a best guess, and illusions as guesses gone confidently wrong.',
    extension: true,
    lessons: [
      { n: 'P.1', slug: 'predictive-brain', title: 'The predictive brain' },
      { n: 'P.2', slug: 'illusions-as-predictions', title: 'Illusions as predictions' },
    ],
  },
  {
    n: null,
    slug: 'time',
    title: 'Time in the brain',
    short: 'Time',
    classes: 'Extension',
    blurb: 'How a brain without a clock still keeps time, and why time flies or drags.',
    extension: true,
    lessons: [
      { n: 'T.1', slug: 'internal-clock', title: 'The internal clock' },
      { n: 'T.2', slug: 'time-judgement', title: 'Judging time' },
    ],
  },
];

export const coreChapters = chapters.filter((c) => !c.extension);
export const extensionChapters = chapters.filter((c) => c.extension);

export function chapterBySlug(slug: string): Chapter | undefined {
  return chapters.find((c) => c.slug === slug);
}

export const totalCoreLessons = coreChapters.reduce((sum, c) => sum + c.lessons.length, 0);
