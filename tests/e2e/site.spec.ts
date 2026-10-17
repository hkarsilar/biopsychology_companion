import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Every lesson and lab page in the built site, so new ones are tested without editing this file. */
function builtPages(): string[] {
  const dist = join(process.cwd(), 'dist');
  const found: string[] = [];
  const sub = (dir: string) => (existsSync(join(dist, dir)) ? readdirSync(join(dist, dir), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);
  for (const chapter of sub('chapters')) {
    found.push(`chapters/${chapter}/`);
    for (const lesson of sub(`chapters/${chapter}`)) found.push(`chapters/${chapter}/${lesson}/`);
  }
  for (const sim of sub('lab')) found.push(`lab/${sim}/`);
  return found;
}

const pages = [
  ...new Set([
    '',
    'chapters/',
    'lab/',
    'course/',
    'toolbox/',
    'toolbox/glossary/',
    'about/',
    'teachers/',
    'accessibility/',
    'privacy/',
    'licence/',
    ...builtPages(),
  ]),
];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

for (const path of pages) {
  test(`/${path} loads cleanly and passes axe`, async ({ page }) => {
    const errors = collectErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page).toHaveTitle(/NeuroCapybara/);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('the paper theme passes axe on the lesson page', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nc-settings', JSON.stringify({ theme: 'light' })));
  await page.goto('chapters/neuron/action-potential/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => v.id)).toEqual([]);
});

test('unknown pages show the 404 page', async ({ page }) => {
  const res = await page.goto('no-such-page/');
  expect(res?.status()).toBe(404);
  await expect(page.locator('h1')).toContainText('synapse');
});

test('display settings change the theme and survive a reload', async ({ page }) => {
  await page.goto('');
  await page.getByRole('button', { name: 'Display settings' }).click();
  await page.getByLabel('Paper').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('every internal link on the main pages resolves', async ({ page, request }) => {
  const seen = new Set<string>();
  for (const path of ['', 'chapters/', 'chapters/neuron/action-potential/', 'course/', 'lab/']) {
    await page.goto(path);
    const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href.split('#')[0]));
    for (const h of hrefs) seen.add(h);
  }
  for (const href of seen) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
  }
});
