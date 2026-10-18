import { test, expect } from '@playwright/test';

const sim = (page: import('@playwright/test').Page) => page.locator('nc-synapse');
const mv = (text: string | null) => Number((text ?? '').replace('−', '-').replace(/[^0-9.+-]/g, ''));

const STAGES = [
  'Spike arrives',
  'Ca²⁺ channels open',
  'Ca²⁺ flows in',
  'Vesicles fuse',
  'Transmitter binds',
  'Channels open: PSP',
  'Transmitter cleared',
  'PSP peaks and fades',
  'Vesicles recycled',
];

test('Next step walks through every stage of transmission in order', async ({ page }) => {
  await page.goto('lab/synapse/');
  const el = sim(page);
  const now = el.locator('.stages li[aria-current="step"]');
  for (const stage of STAGES) {
    await el.locator('.next').click();
    await expect(now).toContainText(stage);
    if (stage === 'PSP peaks and fades') {
      // One glutamate spike: a small EPSP, well below the 10 mV it would take to reach threshold.
      const psp = mv(await el.locator('.r-psp').textContent());
      expect(psp).toBeGreaterThan(2);
      expect(psp).toBeLessThan(10);
    }
  }
  await expect(el.locator('.caption')).not.toBeEmpty();
});

test('a receptor blocker shrinks the PSP compared with the no-drug control', async ({ page }) => {
  await page.goto('lab/synapse/?transmitter=ach&drug=antagonist&speed=50');
  const el = sim(page);
  await expect(el.locator('input[name="tx"][value="ach"]')).toBeChecked();
  await expect(el.locator('input[name="drug"][value="antagonist"]')).toBeChecked();
  await expect(el.locator('.r-ctrl-wrap')).toBeVisible();
  await el.locator('.spike').click();
  await expect(el.locator('.r-ctrl')).toHaveText(/\+\d/, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  const withDrug = mv(await el.locator('.r-psp').textContent());
  const control = mv(await el.locator('.r-ctrl').textContent());
  expect(control).toBeGreaterThan(withDrug * 2);
});

test('a drug with nothing to act on says so', async ({ page }) => {
  await page.goto('lab/synapse/?transmitter=ach&drug=reuptake');
  await expect(sim(page).locator('.drug-note')).toContainText('changes nothing');
});

test('switching to GABA gives an inhibitory synapse', async ({ page }) => {
  await page.goto('lab/synapse/');
  const el = sim(page);
  await el.locator('input[name="tx"][value="gaba"]').check();
  await expect(el.locator('.subtitle')).toContainText('GABA-A');
  for (let i = 0; i < 8; i++) await el.locator('.next').click();
  await expect(el.locator('.stages li[aria-current="step"]')).toContainText('PSP peaks');
  expect(mv(await el.locator('.r-psp').textContent())).toBeLessThan(0);
});

test('keyboard shortcuts work inside the simulation', async ({ page }) => {
  await page.goto('lab/synapse/');
  const el = sim(page);
  await el.locator('.next').focus();
  await page.keyboard.press('n');
  await expect(el.locator('.stages li[aria-current="step"]')).toContainText('Spike arrives');
});

test('a Try-it card in the drugs lesson loads the drug', async ({ page }) => {
  await page.goto('chapters/neuron/drugs/');
  await page.getByRole('button', { name: 'Set it up' }).nth(1).click();
  const el = page.locator('#drug-sim');
  await expect(el.locator('input[name="tx"][value="ach"]')).toBeChecked();
  await expect(el.locator('input[name="drug"][value="enzyme"]')).toBeChecked();
});

test('transmitter cards filter and turn over', async ({ page }) => {
  await page.goto('chapters/neuron/drugs/');
  const cards = page.locator('#tx-cards');
  await cards.getByRole('button', { name: '± Depends on the receptor' }).click();
  await expect(cards.locator('.tx-card:visible')).toHaveCount(4);
  await expect(cards.locator('.tx-count')).toContainText('Showing 4');
  const ach = cards.locator('.tx-card', { hasText: 'Acetylcholine' });
  await ach.getByRole('button', { name: /Turn over/ }).click();
  await expect(ach.locator('.back')).toBeVisible();
  await expect(ach.locator('.back')).toContainText('Muscarinic M2');
  await expect(ach.getByRole('button', { name: /Turn back/ })).toHaveAttribute('aria-expanded', 'true');
});
