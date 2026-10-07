import { describe, expect, it } from 'vitest';
import { ScriptedDispatcher } from './scripted.js';
import { AgentDirector } from './director.js';

function makeDirector(nowRef: { t: number }) {
  return new AgentDirector({
    brain: new ScriptedDispatcher(),
    fallback: new ScriptedDispatcher(),
    brainIntervalMs: 50,
    now: () => nowRef.t,
  });
}

function step(d: AgentDirector, nowRef: { t: number }, ms: number, stride = 100): void {
  const end = nowRef.t + ms;
  while (nowRef.t < end) {
    nowRef.t += stride;
    d.tick();
  }
}

describe('AgentDirector (police slice)', () => {
  it('keeps the full three-second arrest hold with two responding officers', () => {
    const clock = { t: 1_000_000 };
    const d = makeDirector(clock);
    d.setMemberPos('p', 'P', 44, 30, 0, false);
    d.reportCrime('p', 'P', { type: 'kill_ped', x: 44, z: 30, at: clock.t });
    d.reportCrime('p', 'P', { type: 'kill_ped', x: 44, z: 30, at: clock.t });
    expect(d.copCount).toBe(2);
    const cops = (d as unknown as { cruisers: { x: number; z: number }[] }).cruisers;
    for (const c of cops) { c.x = 44; c.z = 30; }
    step(d, clock, 2900);
    expect(d.getSnapshot().wanted.p).toBe(4);
    step(d, clock, 100);
    expect(d.getSnapshot().wanted.p).toBe(0);
    expect(d.drainEvents().filter(e => e.kind === 'busted')).toHaveLength(1);
  });
  it('raises wanted on crime and spawns a cruiser', () => {
    const nowRef = { t: 1_000_000 };
    const d = makeDirector(nowRef);
    d.setMemberPos('p1', 'Racer', 0, 0, 0, false);
    expect(d.copCount).toBe(0);
    d.reportCrime('p1', 'Racer', { type: 'kill_ped', x: 0, z: 0, at: nowRef.t });
    expect(d.copCount).toBe(1);
    expect(d.getSnapshot().wanted['p1']).toBe(2);
  });

  it('decays wanted back to calm when the suspect hides', () => {
    const nowRef = { t: 1_000_000 };
    const d = makeDirector(nowRef);
    d.setMemberPos('p1', 'Racer', 0, 0, 0, false);
    d.reportCrime('p1', 'Racer', { type: 'shooting', x: 0, z: 0, at: nowRef.t });
    expect(d.getSnapshot().wanted['p1']).toBe(1);
    step(d, nowRef, 26_000);
    expect(d.getSnapshot().wanted['p1'] ?? 0).toBe(0);
  });

  it('pursues and busts a stopped suspect', async () => {
    const nowRef = { t: 1_000_000 };
    const d = makeDirector(nowRef);
    // Suspect waits near the post so the cruiser can close in fast.
    d.setMemberPos('p1', 'Racer', 44, 30, 0, false);
    d.reportCrime('p1', 'Racer', { type: 'kill_ped', x: 44, z: 30, at: nowRef.t });
    step(d, nowRef, 8_000);
    // Flush async brain decisions.
    await new Promise((r) => setTimeout(r, 20));
    step(d, nowRef, 10_000);
    const kinds = d.drainEvents().map((e) => e.kind);
    expect(kinds).toContain('pursuit_start');
    expect(kinds).toContain('busted');
    expect(d.getSnapshot().wanted['p1'] ?? 0).toBe(0);
  });

  it('scripted brain holds pursuit and stands down when calm', async () => {
    const brain = new ScriptedDispatcher();
    const goal = await brain.decide({ now: 0, cops: [], suspects: [] });
    expect(goal).toBeNull();
  });
});
