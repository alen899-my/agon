import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, RaceSim } from './RaceSim';
import { F1_LENGTH, f1PathAt } from './F1Track';

function startF1(laps = 1): RaceSim {
  const race = new RaceSim();
  race.create('host', 'Host', 'car', laps, 'f1');
  race.upsertRemote({ id: 'guest', name: 'guest', ready: true, vehicleKind: 'car', lap: 1, checkpoint: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0, isLocal: false });
  race.startCountdown(100_000);
  race.pollCountdown(100_000 + COUNTDOWN_MS + 50);
  return race;
}

describe('F1 race timing', () => {
  it('defaults to city and carries the track through snapshots', () => {
    const city = new RaceSim();
    city.create('h', 'H', 'car', 3);
    expect(city.track).toBe('city');
    expect(city.snapshot().track).toBe('city');
    const f1 = new RaceSim();
    f1.create('h', 'H', 'car', 3, 'f1');
    expect(f1.track).toBe('f1');
    const guest = new RaceSim();
    guest.joinAs('g', 'G', 'car', 'h', 'f1');
    guest.applySnapshot(f1.snapshot());
    expect(guest.track).toBe('f1');
    // Old snapshots without a track default to city.
    const legacy = f1.snapshot() as Record<string, unknown>;
    delete legacy.track;
    const old = new RaceSim();
    old.joinAs('g', 'G', 'car', 'h');
    old.applySnapshot(legacy as never);
    expect(old.track).toBe('city');
  });
  it('counts a full F1 lap by distance, not city length', () => {
    const race = startF1(1);
    expect(race.track).toBe('f1');
    const tick = (dist: number, elapsed: number): void => {
      const p = f1PathAt(dist, 0);
      race.tickLocal(p.x, p.z, race.startedAt + elapsed);
    };
    tick(-6, 0);
    for (let d = 0; d <= F1_LENGTH + 8; d += 4) tick(d, (d + 4) * 100);
    const me = race.racers.get('host')!;
    expect(me.finished).toBe(true);
    expect(me.dist).toBe(F1_LENGTH);
  });
});
