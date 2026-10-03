import { test, expect } from '@playwright/test';

// Public + private server flows. Needs the dev API on :4000 (`npm run dev` in server/);
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

test('host creates a public server, guest joins by code, counts sync', async ({ browser }) => {
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
    await a.getByRole('tab', { name: 'HOST' }).click();
    await a.getByLabel('New server name').fill('E2E Arena');
    await a.getByRole('button', { name: 'HOST HOST SERVER' }).click();
    await expect(a.locator('.room-code-panel b')).toBeVisible();
    const code = (await a.locator('.room-code-panel b').textContent())?.trim() ?? '';
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    // Invite link is shown next to the code.
    await expect(a.locator('.room-code-panel')).toContainText(`?code=${code}`);
    await a.getByRole('button', { name: 'ENTER WORLD' }).click();
    await expect(a.locator('.world-intro')).toHaveCount(0);

    await b.getByRole('tab', { name: 'JOIN' }).click();
    await b.getByLabel('Server code').fill(code);
    await b.getByRole('button', { name: 'JOIN WORLD' }).click();
    await expect(b.locator('.world-intro')).toHaveCount(0);

    // Roster fan-out reaches the host menu: 1 → 2 players.
    await a.getByRole('button', { name: 'Open menu' }).click();
    await a.getByRole('tab', { name: 'WORLD' }).click();
    await expect(a.locator('.menu-sheet')).toContainText('E2E Arena');
    await expect.poll(async () => a.locator('.menu-sheet').textContent(), { timeout: 15000 }).toContain('2 players');

    // Leaving returns to the intro; the guest sees the count fall back.
    await a.getByRole('button', { name: 'LEAVE SERVER' }).click();
    await expect(a.locator('.world-intro')).toBeVisible();
    await b.getByRole('button', { name: 'Open menu' }).click();
    await b.getByRole('tab', { name: 'WORLD' }).click();
    await expect.poll(async () => b.locator('.menu-sheet').textContent(), { timeout: 15000 }).toContain('1 player');
    await b.getByRole('button', { name: 'LEAVE SERVER' }).click();
    await expect(b.locator('.world-intro')).toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('public browser lists a live server with host and count', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const host = await ctxA.newPage();
  const guest = await ctxB.newPage();
  try {
    await host.goto('/');
    await host.getByLabel('Your display name').fill('E2EHost2');
    await host.getByRole('tab', { name: 'HOST' }).click();
    await host.getByLabel('New server name').fill('E2E Browser Arena');
    await host.getByRole('button', { name: 'HOST HOST SERVER' }).click();
    await expect(host.locator('.room-code-panel b')).toBeVisible();
    const code = (await host.locator('.room-code-panel b').textContent())?.trim() ?? '';
    await host.getByRole('button', { name: 'ENTER WORLD' }).click();
    await expect(host.locator('.world-intro')).toHaveCount(0);

    // A second player browses and sees the live row with name, host and code.
    await guest.goto('/');
    await guest.getByLabel('Your display name').fill('E2EBrowser');
    await guest.getByRole('tab', { name: 'HOST' }).click();
    await expect.poll(async () => guest.locator('.server-list').textContent(), { timeout: 15000 }).toContain(code);
    await expect(guest.locator('.server-list')).toContainText('E2E Browser Arena');
    await expect(guest.locator('.server-list')).toContainText('E2EHost2');

    await host.getByRole('button', { name: 'Open menu' }).click();
    await host.getByRole('button', { name: 'LEAVE SERVER' }).click();
    await expect(host.locator('.world-intro')).toBeVisible();
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test('join rejects unknown codes and stays in the intro', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Your display name').fill('E2ESolo');
  await page.getByRole('tab', { name: 'JOIN' }).click();
  await page.getByLabel('Server code').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'JOIN WORLD' }).click();
  await expect(page.getByText('No server with that code.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'JOIN WORLD' })).toBeVisible();
});

test('invite link prefills the private code', async ({ page }) => {
  await page.goto('/?code=zzzzzz');
  await expect(page.getByRole('tab', { name: 'JOIN' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Server code')).toHaveValue('ZZZZZZ');
});
