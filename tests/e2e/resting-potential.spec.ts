import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-resting-potential');
/** Read a voltage readout such as "−51 mV" or "+12 mV" as a number. */
const mv = (text: string | null) => Number((text ?? '').replace('−', '-').replace(/[^\d.+-]/g, ''));

test('opening potassium channels makes the inside negative', async ({ page }) => {
  await page.goto('lab/resting-potential/');
  const el = sim(page);
  await expect(el.locator('.r-v')).toHaveText('0 mV');
  await el.locator('.play').click();
  await expect.poll(async () => mv(await el.locator('.r-v').textContent()), { timeout: 20_000 }).toBeLessThan(-40);
  await expect(el.locator('.r-e')).toHaveText('−89.1 mV');
});

test('with sodium the inside turns positive', async ({ page }) => {
  await page.goto('lab/resting-potential/?ion=na');
  const el = sim(page);
  await expect(el.locator('.pick-na')).toHaveAttribute('aria-pressed', 'true');
  await el.locator('.play').click();
  await expect.poll(async () => mv(await el.locator('.r-v').textContent()), { timeout: 20_000 }).toBeGreaterThan(30);
});

test('a Try-it card in the lesson switches the ion', async ({ page }) => {
  await page.goto('chapters/neuron/resting-potential/');
  await page.locator('.try-btn[data-preset="chloride"]').click();
  const el = sim(page);
  await expect(el.locator('.pick-cl')).toHaveAttribute('aria-pressed', 'true');
  await expect(el.locator('.r-e')).toHaveText('−64.1 mV');
});
