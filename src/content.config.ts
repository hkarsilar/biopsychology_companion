import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const lessons = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/lessons' }),
  schema: z.object({
    title: z.string(),
    /** Lesson number, e.g. "2.3" */
    number: z.string(),
    /** Chapter slug from src/data/chapters.ts */
    chapter: z.string(),
    /** URL segment; must match the lesson's slug in chapters.ts */
    slug: z.string(),
    summary: z.string(),
    objectives: z.array(z.number().int().min(1).max(6)),
    minutes: z.number().int(),
    readings: z
      .array(z.object({ book: z.string(), section: z.string(), url: z.url() }))
      .default([]),
    sims: z.array(z.string()).default([]),
    updated: z.coerce.date(),
  }),
});

export const collections = { lessons };
