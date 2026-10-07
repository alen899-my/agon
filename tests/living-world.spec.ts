import { test, expect } from '@playwright/test';

test('people hold visible conversations and racers leave the grid smoothly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Your display name').fill('Street Tester');
  await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__worldEngine?.agents.walkers.length ?? 0)).toBe(20);
  const result = await page.evaluate(async () => {
    const e = (window as any).__worldEngine, sim = e.simulation;
    // Inject a model fixture: offline tests must never use canned runtime speech.
    e.agents.soloDirector.world.dialogue = async () => ['A generated test opening.', 'A contextual test reply.'];
    sim.time += 0.1; e.agents.update(0.1, sim, true, false);
    await new Promise(resolve => setTimeout(resolve, 0));
    sim.time += 0.1; e.agents.update(0.1, sim, true, false);
    sim.x = 22; sim.z = -10;
    e.syncAgentPeople(1 / 60);
    const speaker = e.agents.walkers.find((p: any) => p.task === 'talk' && p.say);
    const mesh = speaker && e.agentPeds.get(speaker.id);
    const speech = !!mesh && mesh.label === speaker.say;
    const hasListener = e.agents.walkers.some((p: any) => p.task === 'listen' && p.speed === 0);
    sim.x = -45; sim.z = 82;
    let previous: { x: number; z: number } | undefined, maxStep = 0, moving = false;
    for (let i = 0; i < 400; i++) {
      sim.time += 1 / 60; e.agents.update(1 / 60, sim, true, false);
      e.syncAgentPeople(1 / 60); e.syncAgentVehicles();
      const ride = e.agents.rides[0];
      if (!ride) continue;
      if (previous) maxStep = Math.max(maxStep, Math.hypot(ride.x - previous.x, ride.z - previous.z));
      previous = { x: ride.x, z: ride.z }; moving ||= ride.speed > 2;
    }
    return { speech, hasListener, maxStep, moving };
  });
  expect(result.speech).toBe(true); expect(result.hasListener).toBe(true);
  expect(result.moving).toBe(true); expect(result.maxStep).toBeLessThan(0.6);
  expect(errors).toEqual([]);
});

test('scripted world: people, foot arrest, construction and collision on low quality', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => localStorage.setItem('agon-quality', 'low'));
  await page.goto('/');
  await page.getByLabel('Your display name').fill('World Tester');
  await page.getByRole('button', { name: 'EXPLORE DISTRICT' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__worldEngine?.agents.walkers.length ?? 0)).toBeGreaterThanOrEqual(12);
  const result = await page.evaluate(async () => {
    const engine = (window as any).__worldEngine;
    engine.applyQuality('low');
    const sim = engine.simulation, agents = engine.agents;
    sim.x = 76; sim.z = 33; sim.hitSeq++; sim.hitKill = true;
    let footOfficer = false, pursuit = false;
    for (let i = 0; i < 900; i++) {
      sim.update(1 / 60); agents.update(1 / 60, sim, true, false);
      pursuit ||= agents.cops.some((c: any) => c.pursuing);
      footOfficer ||= agents.walkers.some((p: any) => p.task === 'arrest');
      if (i % 60 === 0) await Promise.resolve();
    }
    for (let i = 0; i < 1500; i++) {
      sim.time += 0.1; agents.update(0.1, sim, true, false);
      if (i % 50 === 0) await Promise.resolve();
    }
    const site = agents.sites[0];
    return { pursuit, footOfficer, busted: sim.bustedSeq, stages: agents.sites.map((s: any) => s.stage),
      blocked: sim.walkBlocked(site.x, site.z),
      carBlocked: !!sim.contact({ x: site.x, z: site.z, yaw: 0, halfWidth: 1, halfLength: 2 }),
      walkers: agents.walkers.length };
  });
  expect(result.pursuit).toBe(true);
  expect(result.footOfficer).toBe(true);
  expect(result.busted).toBe(1);
  expect(result.stages).toEqual([4, 4]);
  expect(result.blocked).toBe(true);
  expect(result.carBlocked).toBe(true);
  expect(result.walkers).toBeLessThanOrEqual(20);
  await page.evaluate(() => {
    const sim = (window as any).__worldEngine.simulation;
    sim.x = 59; sim.z = 33; sim.yaw = 0; sim.facing = 0;
  });
  await page.waitForTimeout(1000);
  const render = await page.evaluate(() => {
    const e = (window as any).__worldEngine;
    return { people: e.agentPeds.size, calls: e.renderer.info.render.calls, shadows: e.renderer.shadowMap.enabled };
  });
  expect(render.people).toBeLessThanOrEqual(20);
  expect(render.calls).toBeLessThan(1600);
  expect(render.shadows).toBe(false);
  console.log('Low quality render:', render);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/living-world-low.png' });
});
