import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-summation');

test('two synapses fired together reach threshold (spatial summation)', async ({ page }) => {
  await page.goto('lab/summation/?preset=spatial&speed=50');
  const el = sim(page);
  await expect(el.locator('.r-spikes')).toHaveText('1', { timeout: 15_000 });
  await expect(el.locator('.r-peak')).toHaveText('threshold reached', { timeout: 15_000 });
});

test('inhibition on the cell body vetoes the spike', async ({ page }) => {
  await page.goto('lab/summation/?preset=veto&speed=50');
  const el = sim(page);
  await expect(el.locator('.r-peak')).toContainText('short', { timeout: 15_000 });
  await expect(el.locator('.r-spikes')).toHaveText('0');
});

test('synapses can be placed and fired with the keyboard', async ({ page }) => {
  await page.goto('lab/summation/?preset=free&speed=50');
  const el = sim(page);
  await expect(el.locator('input[name="tool"][value="exc"]')).toBeChecked();
  const a1 = el.getByRole('button', { name: /^A1, 80 µm/ });
  await a1.focus();
  await page.keyboard.press('Enter');
  await expect(a1).toHaveClass(/exc/);
  await expect(a1).toHaveAccessibleName(/excitatory synapse/);
  await el.locator('input[name="tool"][value="fire"]').check();
  await a1.focus();
  await page.keyboard.press('Enter');
  await expect(el.locator('.r-peak')).toContainText('short', { timeout: 15_000 });
  await expect(el.locator('.r-spikes')).toHaveText('0');
});

test('a shared link restores synapses and sliders', async ({ page }) => {
  await page.goto('lab/summation/?sites=A1e,B1e,Si&tau=30&lambda=500');
  const el = sim(page);
  await expect(el.getByRole('button', { name: /^A1,/ })).toHaveClass(/exc/);
  await expect(el.getByRole('button', { name: /^S,/ })).toHaveClass(/inh/);
  await expect(el.locator('.o-tau')).toHaveText('30 ms');
  await expect(el.locator('.o-lambda')).toHaveText('500 µm');
});

test('a Try-it card in the lesson sets up the board', async ({ page }) => {
  await page.goto('chapters/neuron/summation/');
  await page.getByRole('button', { name: 'Set it up' }).nth(3).click();
  const el = page.locator('#summation-sim');
  await expect(el.getByRole('button', { name: /^S,/ })).toHaveClass(/inh/);
});
