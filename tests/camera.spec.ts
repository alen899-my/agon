import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const now = new Date('2026-01-01T12:00:00Z');
  await page.clock.install({ time: now }); await page.clock.pauseAt(now);
});

test('captured look releases for map, Escape, pause and focus loss', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Pointer lock is for mouse and trackpad input');
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  const canvas = page.locator('canvas');
  const capture = async () => {
    const box = (await canvas.boundingBox())!;
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(canvas).toHaveAttribute('data-look-state', 'locked');
  };
  await capture(); await page.keyboard.down('w'); await page.keyboard.press('m');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-look-state', 'free');
  const before = await page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { distance: number } } }).__worldEngine?.simulation.distance ?? null);
  await page.clock.runFor(250);
  expect(await page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { distance: number } } }).__worldEngine?.simulation.distance ?? null)).toBe(before);
  await page.keyboard.up('w'); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'A moment to yourself.' })).toBeHidden();
  await capture(); await page.keyboard.press('p');
  await expect(canvas).toHaveAttribute('data-look-state', 'free');
  await expect(page.getByRole('heading', { name: 'A moment to yourself.' })).toBeVisible();
  await page.getByRole('button', { name: 'KEEP EXPLORING' }).click();
  await capture(); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(canvas).toHaveAttribute('data-look-state', 'free');
  await expect(page.getByRole('heading', { name: 'A moment to yourself.' })).toBeVisible();
});

test('camera preferences persist and the settings overlay suspends movement', async ({ page }) => {
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'CAMERA' }).click();
  await page.getByRole('slider', { name: 'Mouse and trackpad sensitivity' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('slider', { name: 'Mouse and trackpad sensitivity' })).toHaveValue('3');
  await page.getByRole('switch', { name: 'Invert vertical look' }).click();
  await expect(page.getByRole('switch', { name: 'Invert vertical look' })).toHaveAttribute('aria-checked', 'true');
  const before = await page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { distance: number } } }).__worldEngine?.simulation.distance ?? null);
  await page.keyboard.down('w'); await page.clock.runFor(300); await page.keyboard.up('w');
  expect(await page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { distance: number } } }).__worldEngine?.simulation.distance ?? null)).toBe(before);
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden();
  await page.reload(); await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'CAMERA' }).click();
  await expect(page.getByRole('slider', { name: 'Mouse and trackpad sensitivity' })).toHaveValue('3');
  await expect(page.getByRole('switch', { name: 'Invert vertical look' })).toHaveAttribute('aria-checked', 'true');
});

test('capture rejection falls back without errors or a held mouse button', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop capture fallback');
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => Promise.reject(new DOMException('Not available', 'NotSupportedError'));
  });
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  const canvas = page.locator('canvas'), box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(canvas).toHaveAttribute('data-look-state', 'fallback');
  const before = await page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { yaw: number } } }).__worldEngine?.simulation.yaw ?? null);
  await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 10 });
  await page.clock.runFor(150);
  expect(await page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { yaw: number } } }).__worldEngine?.simulation.yaw ?? null)).not.toBe(before);
  expect(errors).toEqual([]);
});
