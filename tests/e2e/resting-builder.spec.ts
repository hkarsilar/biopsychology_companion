import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-resting-builder');
const mv = (text: string | null) => Number((text ?? '').replace('−', '-').replace(/[^\d.+-]/g, ''));

test('a typical neuron rests near −72 mV with the pump running', async ({ page }) => {
  await page.goto('lab/resting-builder/');
  const el = sim(page);
  await expect(el.locator('.r-v')).toHaveText('−71.7 mV');
  await expect(el.locator('.r-pump')).toHaveText('−4.3 mV');
});

test('a shared link with only potassium leaking gives E_K', async ({ page }) => {
  await page.goto('lab/resting-builder/?pk=1&pna=0&pcl=0&pump=off');
  const el = sim(page);
  await expect(el.locator('.r-v')).toHaveText('−89.1 mV');
  await expect(el.locator('input.pump')).not.toBeChecked();
});

test('raising potassium outside depolarises the membrane', async ({ page }) => {
  await page.goto('lab/resting-builder/');
  const el = sim(page);
  await el.locator('.preset[data-preset="hyperkalaemia"]').click();
  await expect(el.locator('.r-v')).toHaveText('−59.3 mV');
  await expect(el.locator('input.conc[data-ion="k"][data-side="out"]')).toHaveValue('12');
});

test('typing a concentration updates the voltage', async ({ page }) => {
  await page.goto('lab/resting-builder/');
  const el = sim(page);
  await el.locator('input.conc[data-ion="k"][data-side="out"]').fill('12');
  await expect(el.locator('.r-v')).toHaveText('−59.3 mV');
});

test('switching off the pump lets the gradients run down over time', async ({ page }) => {
  await page.goto('lab/resting-builder/');
  const el = sim(page);
  await el.locator('.speed').selectOption('4');
  await el.locator('input.pump').uncheck();
  await expect(el.locator('.r-clock')).not.toHaveText('0 h', { timeout: 10_000 });
  await expect.poll(async () => mv(await el.locator('.r-v').textContent()), { timeout: 20_000 }).toBeGreaterThan(-55);
});
