import { test } from '@playwright/test';

test('debug avatar visibility', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/debug-0-spawn.png' });
  const canvas = (await page.locator('canvas').boundingBox())!;
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  // Drag sideways to rotate the camera ~1.2 rad.
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 300, cy, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/debug-1-rotated.png' });
});
