import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-lateral-inhibition');

test('the edge preset exaggerates the edge', async ({ page }) => {
  await page.goto('lab/lateral-inhibition/');
  const el = sim(page);
  await expect(el.locator('.tab-strip')).toHaveAttribute('aria-selected', 'true');
  const rate = Number.parseFloat((await el.locator('.r-rate').textContent()) ?? '');
  const alone = Number.parseFloat((await el.locator('.r-alone').textContent()) ?? '');
  // The recorded cell sits just on the bright side of the edge: inhibition lowers its rate.
  expect(rate).toBeGreaterThan(0);
  expect(rate).toBeLessThan(alone);
});

test('a shared link opens the picture view with the Hermann grid', async ({ page }) => {
  await page.goto('lab/lateral-inhibition/?preset=hermann');
  const el = sim(page);
  await expect(el.locator('.tab-image')).toHaveAttribute('aria-selected', 'true');
  await expect(el.locator('.r-irate')).not.toBeEmpty();
});

test('switching tabs shows the matching readouts', async ({ page }) => {
  await page.goto('lab/lateral-inhibition/');
  const el = sim(page);
  await el.locator('.tab-image').click();
  await expect(el.locator('.tab-image')).toHaveAttribute('aria-selected', 'true');
  await expect(el.locator('.ro-image').first()).toBeVisible();
  await expect(el.locator('.ro-strip').first()).toBeHidden();
});
