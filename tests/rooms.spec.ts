import { test, expect } from '@playwright/test';

// Private-server flows. Needs the dev API on :4000 (`npm run dev` in server/);
// the spec skips itself when the API is unreachable so CI stays green solo.
const API = process.env.VITE_API_URL ?? 'http://localhost:4000';

async function apiUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

test.beforeEach(async () => {
  test.skip(!(await apiUp()), 'API offline — rooms need the dev API on :4000');
});

test('create shows a code, join shares the server, leave drops the chip', async ({ browser, isMobile }) => {
  test.skip(!!isMobile, 'Desktop intro layout only (portrait cover blocks the form)');
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  try {
    await a.goto('/');
    await b.goto('/');
    // Fixed names: name login is idempotent, so reruns reuse the same rows.
    await a.getByLabel('Your display name').fill('E2EHost');
    await b.getByLabel('Your display name').fill('E2EGuest');
    await a.getByRole('tab', { name: 'CREATE SERVER' }).click();
    await a.getByRole('button', { name: 'CREATE SERVER' }).click();
    await expect(a.getByText('SHARE THIS CODE')).toBeVisible();
    const code = (await a.locator('.room-code-panel b').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    await a.getByRole('button', { name: 'ENTER WORLD' }).click();
    await expect(a.locator('.room-chip')).toContainText(code);

    await b.getByRole('tab', { name: 'JOIN SERVER' }).click();
    await b.getByLabel('Server code').fill(code);
    await b.getByRole('button', { name: 'JOIN WORLD' }).click();
    await expect(b.locator('.room-chip')).toContainText(code);
    // Roster fan-out reaches the host: 1 → 2 members.
    await expect.poll(async () => a.locator('.room-chip').textContent(), { timeout: 15000 }).toContain('· 2');

    // Leaving drops the chip locally; the guest sees the count fall back.
    await a.getByRole('button', { name: 'Leave server' }).click();
    await expect(a.locator('.room-chip')).toHaveCount(0);
    await expect.poll(async () => b.locator('.room-chip').textContent(), { timeout: 15000 }).toContain('· 1');
    await b.getByRole('button', { name: 'Leave server' }).click();
    await expect(b.locator('.room-chip')).toHaveCount(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('join rejects unknown codes and stays in the intro', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'Desktop intro layout only (portrait cover blocks the form)');
  await page.goto('/');
  await page.getByLabel('Your display name').fill('E2ESolo');
  await page.getByRole('tab', { name: 'JOIN SERVER' }).click();
  await page.getByLabel('Server code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'JOIN WORLD' }).click();
  await expect(page.getByText('No server with that code.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'JOIN WORLD' })).toBeVisible();
});
