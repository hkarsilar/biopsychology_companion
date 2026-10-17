// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

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
  build: { format: 'directory' },
});
