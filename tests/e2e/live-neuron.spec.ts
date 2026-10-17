import { test, expect } from '@playwright/test';

test('one poke stays below threshold, two quick pokes make a spike', async ({ page }) => {
  await page.goto('');
  const el = page.locator('nc-live-neuron');
  const poke = el.locator('button.excite');
  await poke.click();
  await expect(el.locator('.caption')).not.toContainText('spike!', { timeout: 3000 });
  await page.waitForTimeout(5000);
  await poke.click();
  await poke.click();
  await expect(el.locator('.caption')).toContainText('spike!', { timeout: 8000 });
});
