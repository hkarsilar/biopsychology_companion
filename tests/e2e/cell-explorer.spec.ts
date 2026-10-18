import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-cell-explorer');

test('choosing a glial cell shows what it does', async ({ page }) => {
  await page.goto('lab/cell-explorer/');
  const el = sim(page);
  await el.locator('.chip[data-part="astrocyte"]').click();
  await expect(el.locator('.info .name')).toHaveText('Astrocyte');
  await expect(el.locator('.chip[data-part="astrocyte"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(el.locator('.info .name')).toHaveText('Oligodendrocyte');
});

test('clicking the drawing selects that part', async ({ page }) => {
  await page.goto('lab/cell-explorer/');
  const el = sim(page);
  await el.locator('svg.scene g[data-parts="oligodendrocyte"] circle').last().click();
  await expect(el.locator('.info .name')).toHaveText('Oligodendrocyte');
});

test('following the signal runs from the synapse to the muscle', async ({ page }) => {
  await page.goto('lab/cell-explorer/');
  const el = sim(page);
  await el.locator('.play').click();
  await expect(el.locator('.caption')).toContainText('A message arrives');
  await expect(el.locator('.caption')).toContainText('Jumping from node to node', { timeout: 15_000 });
  await expect(el.locator('.caption')).toContainText('Release at the terminals', { timeout: 15_000 });
  await expect(el.locator('.play')).toHaveAttribute('aria-label', 'Follow the signal', { timeout: 15_000 });
});

test('the shapes tab shows the three neuron shapes', async ({ page }) => {
  await page.goto('lab/cell-explorer/?view=shapes');
  const el = sim(page);
  await expect(el.locator('#panel-shapes')).toBeVisible();
  await expect(el.locator('#panel-shapes')).toContainText('Unipolar');
  await el.getByRole('tab', { name: 'The cells' }).click();
  await expect(el.locator('#panel-cells')).toBeVisible();
});

test('on a phone the drawing zooms in on the chosen part', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) > 600, 'phone only');
  await page.goto('lab/cell-explorer/');
  const el = sim(page);
  await el.locator('.chip[data-part="microglia"]').click();
  await expect(el.locator('svg.scene')).not.toHaveAttribute('viewBox', '0 0 1000 560');
});

test('a Try-it card in the lesson opens the shapes tab', async ({ page }) => {
  await page.goto('chapters/neuron/cells/');
  await page.locator('.try-btn[data-preset="shapes"]').click();
  await expect(sim(page).locator('#panel-shapes')).toBeVisible();
});
