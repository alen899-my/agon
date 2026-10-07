import { describe, expect, it } from 'vitest';
import { BUILD_LOTS, LivingWorld } from '../../server/src/agents/livingWorld';
import { BUILDINGS, PROPS, PARKED_CARS, onRoad, RACE_CLEARANCE, inWater, intersects } from './Map';
import { Simulation } from './Simulation';
import { AgentSim } from './AgentSim';

describe('shared construction', () => {
  it('holds generated conversation, alternates speakers, and releases both participants', async () => {
    const world = new LivingWorld();
    world.dialogue = async () => ['Test opening about noodles.', 'One bowl for the test.', 'Test closing.'];
    const input = { cops: [], members: [] };
    world.tick(0.1, 100, input);
    await new Promise(resolve => setTimeout(resolve, 0));
    world.tick(0.1, 200, input);
    const vendor = world.snapshot().find(p => p.role === 'vendor' && p.task === 'talk')!;
    expect(vendor.say).toContain('noodles');
    const listener = world.snapshot().find(p => p.task === 'listen' && Math.hypot(p.x - vendor.x, p.z - vendor.z) < 6)!;
    expect(listener).toBeDefined();
    world.tick(0.1, 3500, input);
    expect(world.snapshot().find(p => p.id === vendor.id)).toMatchObject({ x: vendor.x, z: vendor.z, task: 'listen', speed: 0 });
    expect(world.snapshot().find(p => p.id === listener.id)?.say).toContain('One bowl');
    world.tick(0.1, 10000, input);
    expect(world.snapshot().find(p => p.id === vendor.id)?.task).toBe('sell');
  });
  it('interrupts social time so the medic can respond to an incident', () => {
    const world = new LivingWorld();
    world.tick(0.1, 100, { cops: [], members: [] });
    const medic = world.snapshot().find(p => p.role === 'medic')!;
    world.incident(medic.x, medic.z, 200);
    world.tick(0.1, 200, { cops: [], members: [] });
    expect(world.snapshot().find(p => p.id === medic.id)?.task).toBe('treat');
  });
  it('reaches performance and photo stops with real map collision', () => {
    const world = new LivingWorld();
    const activities = new Set<string>();
    const blocked = (x: number, z: number) => intersects(x, z, 0.4) || inWater(x, z);
    for (let t = 100; t <= 60000; t += 100) {
      world.tick(0.1, t, { cops: [], members: [], blocked });
      for (const p of world.snapshot()) activities.add(p.task);
    }
    for (const activity of ['dance', 'watch', 'photo', 'repair']) expect(activities.has(activity), activity).toBe(true);
  });
  it('clears a race when drivers finish on different ticks', () => {
    const world = new LivingWorld();
    const input = { cops: [], members: [] };
    world.directives.raceNow = true;
    world.tick(0.1, 100, input);
    expect(world.rides).toHaveLength(2);
    world.rides[0].state = 'cooldown';
    world.rides[1].state = 'racing'; world.rides[1].dist = 100000;
    world.tick(0.1, 200, input);
    for (let t = 300; t < 5000; t += 100) world.tick(0.1, t, input);
    expect(world.rides).toHaveLength(0);
    expect(world.snapshot().filter(p => p.role === 'racer').every(p => !p.hidden)).toBe(true);
  });
  it('background pedestrians stop, reply, and cancel conversation when hurt', async () => {
    const sim = new Simulation(); sim.begin(); sim.time = 4;
    sim.dialogue = async () => ['Test opening.', 'Test reply.', 'Test closing.'];
    const a = sim.peds[0], b = sim.peds[1];
    for (let i = 2; i < sim.peds.length; i++) sim.peds[i].socialCooldown = 100;
    a.x = 20; a.z = 20; b.x = 22; b.z = 20;
    sim.update(1 / 60);
    await new Promise(resolve => setTimeout(resolve, 0));
    sim.update(1 / 60);
    expect(a.activity).toBe('talk'); expect(b.activity).toBe('listen');
    expect(a.move).toBe(0); expect(b.move).toBe(0);
    sim.time += 3.1; sim.update(1 / 60);
    expect(a.say).toBeUndefined(); expect(b.say).toBeTruthy();
    b.scaredUntil = sim.time + 10; sim.update(1 / 60);
    expect(a.socialPeer).toBeUndefined(); expect(b.say).toBeUndefined();
  });
  it('forwards the blast location rather than the distant player location', () => {
    const sim = new Simulation(); sim.begin();
    sim.booms.push({ x: 24, y: 0, z: 12, born: sim.time }); sim.explodeSeq++;
    sim.update(1 / 60);
    expect(sim.drainCrimeEvents()).toContainEqual({ type: 'explosion', x: 24, z: 12 });
  });
  it('keeps complete lot footprints clear of roads, water, buildings and props', () => {
    for (const lot of BUILD_LOTS) {
      for (const x of [lot.x - lot.w / 2 - 1, lot.x + lot.w / 2 + 1]) for (const z of [lot.z - lot.d / 2 - 1, lot.z + lot.d / 2 + 1]) {
        expect(onRoad(x, z, RACE_CLEARANCE)).toBe(false);
        expect(inWater(x, z)).toBe(false);
      }
      expect(BUILDINGS.some(b => Math.abs(b.x - lot.x) < (b.w + lot.w) / 2 + 1 && Math.abs(b.z - lot.z) < (b.d + lot.d) / 2 + 1)).toBe(false);
      expect([...PROPS, ...PARKED_CARS].some(p => Math.abs(p.x - lot.x) < lot.w / 2 + p.r && Math.abs(p.z - lot.z) < lot.d / 2 + p.r)).toBe(false);
    }
  });
  it('applies deltas idempotently to walking and vehicle collision and clears on room leave', () => {
    const sim = new Simulation(), agents = new AgentSim(), lot = BUILD_LOTS[0];
    const delta = { siteId: 'lot-1', stage: 2, box: lot };
    agents.applyBuildDelta(delta, sim); agents.applyBuildDelta(delta, sim);
    agents.applyBuildDelta({ ...delta, stage: 1 }, sim);
    expect(sim.builtBoxes).toHaveLength(1);
    expect(sim.builtBoxes[0].h).toBe(4);
    const physics = sim as unknown as { walkBlocked(x: number, z: number): boolean; contact(b: { x: number; z: number; yaw: number; halfWidth: number; halfLength: number }): unknown };
    expect(physics.walkBlocked(lot.x, lot.z)).toBe(true);
    expect(physics.contact({ ...lot, yaw: 0, halfWidth: 1, halfLength: 2 })).toBeTruthy();
    agents.clearRoomState(sim);
    expect(sim.builtBoxes).toHaveLength(0);
    expect(physics.walkBlocked(lot.x, lot.z)).toBe(false);
  });
  it('builders complete both lots using client map collision', () => {
    const world = new LivingWorld();
    for (let t = 100; t < 160_000; t += 100) world.tick(0.1, t, { cops: [], members: [], blocked: (x, z) => intersects(x, z, 0.4) || inWater(x, z) });
    expect(world.blackboard.sites.map(s => s.stage)).toEqual([4, 4]);
  });
});
