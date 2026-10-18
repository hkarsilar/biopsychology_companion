// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import { lessonLinks } from './src/lib/lesson-links.ts';

// The site lives at https://hkarsilar.github.io/biopsychology_companion/ for now.
// When the custom domain arrives: set SITE to the new domain and BASE to '/'.
const SITE = process.env.SITE_URL ?? 'https://hkarsilar.github.io';
const BASE = process.env.SITE_BASE ?? '/biopsychology_companion';

export default defineConfig({
  site: SITE,
  base: BASE,
  trailingSlash: 'always',
  compressHTML: true,
  integrations: [mdx()],
  // Links "lesson 2.4" in lesson text to that lesson once it exists.
  markdown: { processor: satteri({ mdastPlugins: [lessonLinks({ base: BASE })] }) },
  build: { format: 'directory' },
});
