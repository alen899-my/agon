import { test, expect, type Page } from '@playwright/test';

// HUD shows map + speed only while driving, so heading/waypoint are read off the sim.
const simYaw = (page: Page) => page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { yaw: number } } }).__worldEngine?.simulation.yaw ?? null);

test.beforeEach(async ({ page }) => {
  const now = new Date('2026-01-01T12:00:00Z');
  await page.clock.install({ time: now }); await page.clock.pauseAt(now);
});

test('renders the district, walks, changes perspective, drives and sets a waypoint', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Your display name').fill('Ava');
  await expect(page.getByRole('button', { name: 'EXPLORE DISTRICT' })).toBeEnabled();
  await page.clock.runFor(80);
  await page.screenshot({ path: `test-results/${info.project.name}-district.png` });
  await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click(); await page.clock.runFor(100);
  await expect(page.getByRole('button', { name: /drive/i })).toBeVisible();
  await page.getByRole('button', { name: /drive/i }).click();
  await expect(page.getByRole('button', { name: 'EXIT VEHICLE' })).toBeVisible();
  await page.keyboard.down('w'); await page.clock.runFor(1100); await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'GAME' }).click();
  await expect(page.locator('.menu-stat')).not.toContainText('0 m');
  await page.keyboard.press('Escape'); await page.clock.runFor(80);
  await page.getByRole('button', { name: 'EXIT VEHICLE' }).click();
  await page.keyboard.down('w'); await page.clock.runFor(400); await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'CAMERA' }).click();
  await page.getByRole('radio', { name: 'First person view' }).click();
  await expect(page.getByRole('radio', { name: 'First person view' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape'); await page.clock.runFor(80);
  await page.screenshot({ path: `test-results/${info.project.name}-first-person.png` });
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'CAMERA' }).click();
  await page.getByRole('radio', { name: 'Third person view' }).click(); await page.clock.runFor(80);
  await page.screenshot({ path: `test-results/${info.project.name}-third-person.png` });
  await page.getByRole('button', { name: 'Open district map' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /North Gardens/ }).click();
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { waypoint: string | null } } }).__worldEngine?.simulation.waypoint ?? null)).toBe('park');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'GAME' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A moment to yourself.' })).toBeVisible();
  await page.getByRole('button', { name: 'KEEP EXPLORING' }).click();
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('tab', { name: 'DISPLAY' }).click();
  await page.getByRole('radio', { name: 'Color theme' }).click();
  await page.getByRole('radio', { name: 'Night theme' }).click(); await page.clock.runFor(80);
  await page.screenshot({ path: `test-results/${info.project.name}-night.png` });
  expect(errors).toEqual([]);
});

test('joystick movement and simultaneous camera drag work independently', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch joystick is intentionally hidden on desktop');
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  const session = await page.context().newCDPSession(page);
  const box = (await page.getByRole('group', { name: 'Movement joystick' }).boundingBox())!;
  const canvas = (await page.locator('canvas').boundingBox())!;
  const first = { x: box.x + box.width / 2, y: box.y + 10, id: 1 };
  const second = { x: canvas.x + canvas.width * .63, y: canvas.y + canvas.height * .4, id: 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  await page.clock.runFor(150);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first, { ...second, x: second.x + 50 }] });
  await page.clock.runFor(400);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [second] });
  await page.clock.runFor(300);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.getByRole('button', { name: 'Open menu' }).tap();
  await page.getByRole('tab', { name: 'GAME' }).tap();
  await expect(page.locator('.menu-stat')).not.toContainText('0 m');
  const before = await page.locator('.menu-stat').textContent();
  await page.clock.runFor(300); expect(await page.locator('.menu-stat').textContent()).toBe(before);
});

test('portrait suspends the world and phone controls fit in landscape', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone layout only');
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Turn your world.' })).toBeVisible();
  await page.keyboard.down('w'); await page.clock.runFor(500); await page.keyboard.up('w');
  await page.getByRole('button', { name: 'Open menu' }).tap();
  await page.getByRole('tab', { name: 'GAME' }).tap();
  await expect(page.locator('.menu-stat')).toContainText('0 m');
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole('heading', { name: 'Turn your world.' })).toBeHidden();
  const box = (await page.getByRole('button', { name: 'Jump', exact: true }).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(390); expect(box.height).toBeGreaterThanOrEqual(44);
});

test('driving controls, fleet and cockpit work on each input device', async ({ page, isMobile }, info) => {
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  if (!isMobile) await expect(page.locator('.world-controls')).toBeHidden();
  await page.keyboard.press('e'); await page.clock.runFor(100);
  await expect(page.getByRole('group', { name: 'Movement joystick' })).toHaveCount(0);
  if (isMobile) {
    for (const name of ['Steer left', 'Steer right', 'Gas', 'Brake']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drift', exact: true })).toHaveCount(0);
  } else await expect(page.getByRole('button', { name: 'Gas', exact: true })).toBeHidden();
  await page.keyboard.press('n'); await expect(page.locator('.hud-top')).toContainText('Hatchback');
  await page.keyboard.press('v'); await page.clock.runFor(100);
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __worldEngine?: { simulation: { view: string } } }).__worldEngine?.simulation.view ?? null)).toBe('first');
  await page.screenshot({ path: 'test-results/' + info.project.name + '-cockpit.png' });
  if (!isMobile) {
    const before = await simYaw(page);
    const canvas = (await page.locator('canvas').boundingBox())!;
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
    await page.clock.runFor(150);
    expect(await simYaw(page)).toBe(before);
    await page.locator('canvas').click({ position: { x: canvas.width / 2, y: canvas.height / 2 } });
    await expect(page.locator('canvas')).toHaveAttribute('data-look-state', 'locked');
    await page.mouse.move(canvas.x + canvas.width / 2 + 150, canvas.y + canvas.height / 2, { steps: 10 });
    await page.clock.runFor(150); expect(await simYaw(page)).not.toBe(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('canvas')).toHaveAttribute('data-look-state', 'free');
    await expect(page.getByRole('heading', { name: 'A moment to yourself.' })).toBeVisible();
  }
});

test('mobile pedals and steering support simultaneous touches and release', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch driving only');
  await page.goto('/'); await page.getByLabel('Your display name').fill('Ava'); await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  await page.keyboard.press('e'); await page.clock.runFor(100);
  const session = await page.context().newCDPSession(page);
  const gas = (await page.getByRole('button', { name: 'Gas', exact: true }).boundingBox())!;
  const left = (await page.getByRole('button', { name: 'Steer left', exact: true }).boundingBox())!;
  const a = { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 };
  const b = { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
  await page.clock.runFor(1100);
  await page.getByRole('button', { name: 'Open menu' }).tap();
  await page.getByRole('tab', { name: 'GAME' }).tap();
  await expect(page.locator('.menu-stat')).not.toContainText('0 m');
  await page.keyboard.press('Escape');
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await page.clock.runFor(250);
  await expect(page.locator('.hud-top')).toContainText(/-\d+\.\d m\/s\^2/);
});
