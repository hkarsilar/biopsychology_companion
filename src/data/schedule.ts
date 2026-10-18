/**
 * The course schedule that drives the course hub (/course/).
 * Update this one file each year. Dates are left empty until the 2027 timetable is confirmed.
 */

export interface ClassEntry {
  /** Class number in the course guide, or null for exams and breaks */
  n: number | null;
  week?: string;
  date?: string;
  title: string;
  /** Chapter slug this class belongs to */
  chapter?: string;
  /** Lesson numbers that prepare for or follow up this class */
  lessons?: string[];
  assignment?: string;
  note?: string;
  kind?: 'class' | 'exam' | 'self-study';
}

export const course = {
  code: 'UCG1SS05',
  name: 'Biopsychology',
  institution: 'University College Groningen',
  year: '2026–27',
  datesConfirmed: false,
};

export const schedule: ClassEntry[] = [
  { n: 1, week: '1', title: 'Introduction to Biopsychology 1', chapter: 'foundations', lessons: ['1.1', '1.2'], assignment: 'Cellular Automaton assignment' },
  { n: 2, week: '1', title: 'Introduction to Biopsychology 2', chapter: 'foundations', lessons: ['1.3', '1.4'] },
  { n: 3, week: '2', title: 'Neurophysiology 1: the neuron', chapter: 'neuron', lessons: ['2.1', '2.2', '2.3', '2.4'], assignment: 'Neurophysiology Case Study' },
  { n: 4, week: '2', title: 'Neurophysiology 2: the neuron', chapter: 'neuron', lessons: ['2.5', '2.6', '2.7'] },
  { n: 5, week: '3', title: 'Neural networks 1', chapter: 'networks', lessons: ['3.1', '3.2', '3.3'], assignment: 'Neural Network Workbook', note: 'Groups A and B meet at different times.' },
  { n: 6, week: '3–4', title: 'Neural networks 2', chapter: 'networks', lessons: ['3.4', '3.5', '3.6'], note: 'Groups A and B meet at different times.' },
  { n: 7, week: '4', title: '(Functional) neuroanatomy 1', chapter: 'anatomy', lessons: ['4.1', '4.2', '4.3', '4.4', '4.5'], assignment: 'Neuroanatomy assignment' },
  { n: 8, week: '5', title: 'Neuroscience methods', chapter: 'methods', lessons: ['5.1', '5.2', '5.3', '5.4', '5.5', '5.6'], assignment: 'Journal Article assignment', kind: 'self-study', note: 'Self-study. Not on the midterm; on the final.' },
  { n: null, title: 'Midterm exam', kind: 'exam', note: 'Covers classes 1–7.' },
  { n: 9, week: '5', title: '(Functional) neuroanatomy 2', chapter: 'anatomy', lessons: ['4.6', '4.7', '4.8', '4.9'], assignment: 'Functional Neuroanatomy assignment' },
  { n: 10, week: '6', title: 'The visual system 1', chapter: 'vision', lessons: ['6.1', '6.2', '6.3'] },
  { n: 11, week: '6', title: 'The visual system 2', chapter: 'vision', lessons: ['6.4', '6.5', '6.6'] },
  { n: 12, week: '7', title: 'The visual system 3', chapter: 'vision', lessons: ['6.7', '6.8', '6.9'] },
  { n: 13, week: '8', title: 'The somatosensory system', chapter: 'touch', lessons: ['7.1', '7.2', '7.3', '7.4', '7.5', '7.6'] },
  { n: 14, week: '8', title: 'Emotions', chapter: 'emotion', lessons: ['8.1', '8.2', '8.3', '8.4', '8.5'] },
  { n: 15, week: '9', title: 'Depression', chapter: 'depression', lessons: ['9.1', '9.2', '9.3', '9.4', '9.5'], note: 'The portfolio is due at the end of this week.' },
  { n: null, title: 'Final exam', kind: 'exam', note: 'Covers methods and classes 9–15.' },
];
