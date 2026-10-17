import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-action-potential');

test('zapping the membrane makes exactly one spike', async ({ page }) => {
  await page.goto('lab/action-potential/?speed=4');
  const el = sim(page);
  await el.locator('.play').click();
  await expect(el.locator('.r-spikes')).toHaveText('1', { timeout: 15_000 });
  await expect(el.locator('.caption')).not.toBeEmpty();
});

test('TTX from a shared link blocks the spike', async ({ page }) => {
  await page.goto('lab/action-potential/?drugs=ttx&speed=4');
  const el = sim(page);
  await expect(el.locator('input.ttx')).toBeChecked();
  await el.locator('.play').click();
  await el.locator('.zap').click();
  await page.waitForTimeout(3000);
  await expect(el.locator('.r-spikes')).toHaveText('0');
});

test('keyboard shortcuts work inside the simulation', async ({ page }) => {
  await page.goto('lab/action-potential/?speed=4');
  const el = sim(page);
  await el.locator('.play').focus();
  await page.keyboard.press('Space');
  await expect(el.locator('.play')).toHaveAttribute('aria-label', 'Pause');
});

test('a Try-it card in the lesson sets up the simulation', async ({ page }) => {
  await page.goto('chapters/neuron/action-potential/');
  await page.getByRole('button', { name: 'Set it up' }).last().click();
  await expect(sim(page).locator('input.ttx')).toBeChecked();
});

test('the predict step reveals an explanation', async ({ page }) => {
  await page.goto('chapters/neuron/action-potential/');
  const box = page.locator('.predict').first();
  await box.getByRole('button', { name: 'About the same height.' }).click();
  await expect(box.locator('.reveal')).toBeVisible();
  await expect(box.locator('.verdict')).toHaveText('Good prediction.');
});

test('check-yourself questions give feedback and a score', async ({ page }) => {
  await page.goto('chapters/neuron/action-potential/');
  const q = page.locator('.cq').first();
  await q.locator('input[type=radio]').first().check();
  await expect(q.locator('.cfb')).toContainText('Right.');
  await expect(page.locator('.check .score')).toContainText('1 of 1');
});

test('embed mode hides the site chrome', async ({ page }) => {
  await page.goto('lab/action-potential/?embed=1');
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(sim(page)).toBeVisible();
});
