import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-conduction');

test('all three axons finish the race, myelinated first', async ({ page }) => {
  await page.goto('lab/conduction/?speed=5');
  const el = sim(page);
  await el.locator('.fire').click();
  await expect(el.locator('.r-lane-2')).toContainText('finished in', { timeout: 20_000 });
  await expect(el.locator('.r-lane-0')).toContainText('finished in', { timeout: 20_000 });
  await expect(el.locator('.caption')).not.toBeEmpty();
});

test('losing all the myelin from a stretch blocks the spike', async ({ page }) => {
  await page.goto('lab/conduction/?lanes=myelinated,damaged,thick&damage=100&speed=5');
  const el = sim(page);
  await el.locator('.fire').click();
  await expect(el.locator('.r-lane-1')).toContainText('blocked', { timeout: 20_000 });
  await expect(el.locator('.r-lane-0')).toContainText('finished in', { timeout: 20_000 });
});

test('a Try-it card in the lesson sets up the damaged axon', async ({ page }) => {
  await page.goto('chapters/neuron/conduction/');
  await page.locator('.try-btn[data-preset="ms-severe"]').click();
  const el = sim(page);
  await expect(el.locator('select.lane').nth(1)).toHaveValue('damaged');
  await expect(el.locator('input.damage')).toHaveValue('100');
});
