import { test, expect } from '@playwright/test';

test('order mode can be solved with the keyboard alone', async ({ page }) => {
  await page.goto('chapters/neuron/synapse/');
  const sorter = page.locator('#synapse-order');
  const steps = sorter.locator('ol.steps li .text');
  // Read the right order from "Show the answer", then start again from a shuffle.
  await sorter.getByRole('button', { name: 'Show the answer' }).click();
  const correct = (await steps.allTextContents()).map((t) => t.replace(/^✓/, '').trim());
  await sorter.getByRole('button', { name: 'Start again' }).click();
  for (let i = 0; i < correct.length; i++) {
    const texts = (await steps.allTextContents()).map((t) => t.trim());
    let pos = texts.findIndex((t) => correct[i].startsWith(t));
    if (pos === i) continue;
    await sorter.getByRole('button', { name: `Move up: ${texts[pos]}` }).focus();
    while (pos > i) {
      await page.keyboard.press('Enter');
      pos--;
    }
  }
  await sorter.getByRole('button', { name: 'Check' }).focus();
  await page.keyboard.press('Enter');
  await expect(sorter.locator('.score')).toContainText(`All ${correct.length} steps are in the right order`);
});

test('categories mode: pick a card, place it, and get feedback', async ({ page }) => {
  await page.goto('chapters/neuron/drugs/');
  const sorter = page.locator('#drug-sort');
  const nicotine = sorter.getByRole('button', { name: /^Nicotine, which activates/ });
  await nicotine.focus();
  await page.keyboard.press('Enter');
  await expect(nicotine).toHaveAttribute('aria-pressed', 'true');
  // A keyboard pick moves focus to the first box's button.
  const placeAgonist = sorter.getByRole('button', { name: /in Agonist \(boosts\)/ });
  await expect(placeAgonist).toBeFocused();
  await page.keyboard.press('Enter');
  await sorter.getByRole('button', { name: 'Check' }).click();
  await expect(sorter.locator('.score')).toContainText('You have 1 of 1 placed card right');
  await expect(sorter.locator('.fb.ok')).toContainText('Right.');
});

test('the sorter fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('chapters/neuron/drugs/');
  const sorter = page.locator('#drug-sort');
  await sorter.scrollIntoViewIfNeeded();
  const box = await sorter.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
