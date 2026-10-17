import { getCollection, type CollectionEntry } from 'astro:content';
import { chapters, type Chapter, type LessonStub } from '../data/chapters';
import { url } from './url';

export type LessonEntry = CollectionEntry<'lessons'>;

export function lessonHref(chapter: string, slug: string): string {
  return url(`/chapters/${chapter}/${slug}/`);
}

/** All written lessons, keyed by lesson number ("2.3"). */
export async function writtenLessons(): Promise<Map<string, LessonEntry>> {
  const entries = await getCollection('lessons');
  const map = new Map<string, LessonEntry>();
  for (const e of entries) {
    const chapter = chapters.find((c) => c.slug === e.data.chapter);
    const stub = chapter?.lessons.find((l) => l.n === e.data.number);
    if (!chapter || !stub || stub.slug !== e.data.slug) {
      throw new Error(`Lesson ${e.id}: number ${e.data.number} / slug ${e.data.slug} does not match chapters.ts`);
    }
    map.set(e.data.number, e);
  }
  return map;
}

export interface LessonLink extends LessonStub {
  chapter: Chapter;
  href: string;
  ready: boolean;
}

/** Every planned lesson in course order, with whether it is written yet. */
export async function lessonLinks(): Promise<LessonLink[]> {
  const written = await writtenLessons();
  return chapters.flatMap((chapter) =>
    chapter.lessons.map((l) => ({
      ...l,
      chapter,
      href: lessonHref(chapter.slug, l.slug),
      ready: written.has(l.n),
    })),
  );
}

/** The nearest written lessons before and after this one, in course order. */
export async function neighbours(number: string): Promise<{ prev?: LessonLink; next?: LessonLink }> {
  const all = (await lessonLinks()).filter((l) => !l.chapter.extension);
  const i = all.findIndex((l) => l.n === number);
  if (i < 0) return {};
  const prev = all.slice(0, i).reverse().find((l) => l.ready);
  const next = all.slice(i + 1).find((l) => l.ready);
  return { prev, next };
}
