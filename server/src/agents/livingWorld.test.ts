import { describe, expect, it } from 'vitest';
import { LivingWorld } from './livingWorld.js';
import { AgentDirector } from './director.js';
import { ScriptedDispatcher } from './scripted.js';
import type { AgentGoal } from './types.js';

describe('living world', () => {
  it('assigns exclusive claims and finishes exactly two sites through four stages', () => {
    const world = new LivingWorld();
    const stages: number[] = [];
    for (let t = 100; t <= 150_000; t += 100) {
      world.tick(0.1, t, { cops: [], members: [] });
      expect(new Set(world.blackboard.claims.values()).size).toBe(world.blackboard.claims.size);
      stages.push(...world.construction.drainDeltas().map(d => d.stage));
    }
    expect(world.snapshot()).toHaveLength(20);
    expect(stages.sort()).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(world.blackboard.claims.size).toBe(0);
  });
  it('defers a new solid while someone occupies the lot and restores monotonically', () => {
    const world = new LivingWorld();
    const site = world.blackboard.sites[0];
    world.construction.build(site, 20, true);
    expect(site.stage).toBe(0);
    world.construction.build(site, 0.1, false);
    expect(world.construction.drainDeltas()[0]).toMatchObject({ stage: 1, box: { h: 2 } });
    world.construction.restore([{ siteId: site.id, stage: 4 }, { siteId: site.id, stage: 2 }]);
    expect(site.stage).toBe(4);
  });
  it('sends one medic to an incident, treats it, and expires speech', () => {
    const world = new LivingWorld();
    const medic = world.snapshot().find(a => a.role === 'medic')!;
    world.incident(medic.x, medic.z, 0);
    world.tick(0.1, 100, { cops: [], members: [] });
    expect(world.snapshot().filter(a => a.task === 'treat')).toHaveLength(1);
    for (let t = 200; t < 16_000; t += 100) world.tick(0.1, t, { cops: [], members: [] });
    expect(world.blackboard.incidents.size).toBe(0);
    expect(world.snapshot().find(a => a.id === medic.id)?.say).toBeUndefined();
  });
});

describe('event driven dispatch', () => {
  it('reuses an identical wanted/mode/site signature for sixty seconds', async () => {
    let now = 1000, calls = 0;
    const director = new AgentDirector({ now: () => now, brainIntervalMs: 6000,
      brain: { name: 'count', decide: async () => { calls++; return { action: 'pursue', suspectId: 'p' }; } }, fallback: new ScriptedDispatcher() });
    director.world.construction.restore([{ siteId: 'lot-1', stage: 4 }, { siteId: 'lot-2', stage: 4 }]);
    director.setMemberPos('p', 'P', -130, 0, 15, true);
    const crime = () => director.reportCrime('p', 'P', { type: 'explosion', x: -130, z: 0, at: now });
    crime(); crime(); crime(); director.tick(); await Promise.resolve();
    now += 6100; crime(); director.tick(); await Promise.resolve();
    expect(calls).toBe(1);
  });
  it('makes zero idle calls and one call for a crime without interval polling', async () => {
    let now = 1000, calls = 0;
    const director = new AgentDirector({ now: () => now, brainIntervalMs: 6000,
      brain: { name: 'count', decide: async () => { calls++; return null; } }, fallback: new ScriptedDispatcher() });
    director.world.construction.restore([{ siteId: 'lot-1', stage: 4 }, { siteId: 'lot-2', stage: 4 }]);
    for (; now < 61_000; now += 100) { director.tick(); await Promise.resolve(); }
    expect(calls).toBe(0);
    director.setMemberPos('p', 'P', -130, 0, 15, true);
    director.reportCrime('p', 'P', { type: 'shooting', x: -130, z: 0, at: now });
    for (let i = 0; i < 100; i++) { now += 100; director.tick(); await Promise.resolve(); }
    expect(calls).toBe(1);
  });
  it('rejects an in-flight goal after a new crime changes the world', async () => {
    let now = 1000;
    let resolve!: (goal: AgentGoal) => void;
    const director = new AgentDirector({ now: () => now, brainIntervalMs: 6000,
      brain: { name: 'deferred', decide: () => new Promise(r => { resolve = r; }) }, fallback: new ScriptedDispatcher() });
    director.reportCrime('p', 'P', { type: 'shooting', x: 0, z: 0, at: now });
    director.tick();
    director.reportCrime('q', 'Q', { type: 'explosion', x: 0, z: 0, at: now });
    resolve({ action: 'standDown' }); await Promise.resolve(); await Promise.resolve();
    expect(director.getSnapshot().cops[0].mode).toBe('pursue');
    now += 100;
  });
});
