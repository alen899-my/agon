import { describe, expect, it } from 'vitest';
import { COUNTDOWN_MS, lightStage, RaceSim, type RacerState } from './RaceSim';
import { TRACK_LENGTH, TRACK_POINTS, START_OFFSET } from './Track';

const remote = (id = 'guest'): RacerState => ({ id, name: id, ready: true, vehicleKind: 'car', lap: 1, checkpoint: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0, isLocal: false });
function start(laps = 1) {
  const race = new RaceSim();
  race.create('host', 'Host', 'car', laps);
  race.upsertRemote(remote());
  race.startCountdown(100_000);
  race.pollCountdown(100_000 + COUNTDOWN_MS + 50);
  return race;
}
function point(distance: number) {
  let d = ((distance + START_OFFSET) % TRACK_LENGTH + TRACK_LENGTH) % TRACK_LENGTH;
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const a = TRACK_POINTS[i], b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (d <= len) return { x: a.x + (b.x - a.x) * d / len, z: a.z + (b.z - a.z) * d / len };
    d -= len;
  }
  throw new Error('Invalid distance');
}
function tick(race: RaceSim, distance: number, elapsed: number) {
  const p = point(distance);
  return race.tickLocal(p.x, p.z, race.startedAt + elapsed);
}

describe('optional race lifecycle', () => {
  it('does not adopt unsolicited snapshots or racers', () => {
    const idle = new RaceSim();
    idle.applySnapshot(start().snapshot());
    idle.upsertRemote(remote());
    expect(idle.phase).toBe('idle');
    expect(idle.count).toBe(0);
  });
  it('joiners retain the selected host before their first snapshot', () => {
    const guest = new RaceSim();
    guest.joinAs('guest', 'Guest', 'car', 'host');
    expect(guest.hostId).toBe('host');
    expect(guest.isHost).toBe(false);
    expect(guest.canStart).toBe(false);
  });
  it('requires two ready participants and starts exactly at green', () => {
    const race = new RaceSim();
    race.create('host', 'Host', 'car', 1);
    expect(race.startCountdown(100)).toBe(false);
    race.upsertRemote(remote());
    expect(race.startCountdown(100)).toBe(true);
    race.pollCountdown(100 + COUNTDOWN_MS - 1);
    expect(race.phase).toBe('countdown');
    race.pollCountdown(100 + COUNTDOWN_MS + 100);
    expect(race.startedAt).toBe(100 + COUNTDOWN_MS);
    expect(lightStage(0).green).toBe(true);
  });
  it('translates host timestamps across different device clocks', () => {
    const host = new RaceSim();
    host.create('host', 'Host', 'car', 1);
    host.upsertRemote(remote());
    host.startCountdown(1000);
    const guest = new RaceSim();
    guest.joinAs('guest', 'Guest', 'car', 'host');
    guest.applySnapshot(host.snapshot(1100), 50100);
    expect(guest.countdownEndsAt).toBe(50000 + COUNTDOWN_MS);
    guest.pollCountdown(50000 + COUNTDOWN_MS);
    const started = guest.startedAt;
    guest.applySnapshot(host.snapshot(1200), 50200);
    expect(guest.phase).toBe('racing');
    expect(guest.startedAt).toBe(started);
  });
  it('counts full laps with elapsed times, not page uptime', () => {
    const race = start(2);
    tick(race, -6, 0);
    // Stride-aligned crossings: each wrap lands on the first 4m tick at or
    // past the line, computed per lap (rounding does not compound evenly).
    const cross1 = Math.ceil(TRACK_LENGTH / 4) * 4;
    const cross2 = Math.ceil((TRACK_LENGTH * 2) / 4) * 4;
    for (let d = 0; d <= TRACK_LENGTH * 2 + 8; d += 4) tick(race, d, (d + 4) * 100);
    const me = race.racers.get('host')!;
    expect(me.finished).toBe(true);
    expect(me.lap).toBe(2);
    expect(me.dist).toBe(TRACK_LENGTH * 2);
    expect(me.finishMs).toBe((cross2 + 4) * 100);
    expect(me.bestLapMs).toBe(Math.min(cross1 + 4, cross2 - cross1) * 100);
  });
  it('does not award laps for reversing, skipping sectors, or an initial grid crossing', () => {
    const race = start();
    tick(race, -6, 0);
    tick(race, 2, 100);
    expect(race.racers.get('host')!.finished).toBe(false);
    for (let d = 0; d >= -(TRACK_LENGTH + 12); d -= 4) tick(race, d, 200 - d * 100);
    expect(race.racers.get('host')!.finished).toBe(false);
    tick(race, TRACK_LENGTH - 4, 65000);
    tick(race, 2, 65100);
    expect(race.racers.get('host')!.finished).toBe(false);
  });
  it('preserves local progress when an older host snapshot arrives', () => {
    const host = start(2);
    const guest = new RaceSim();
    guest.joinAs('guest', 'Guest', 'car', 'host');
    guest.applySnapshot(host.snapshot(105000), 105000);
    guest.racers.get('guest')!.dist = 100;
    guest.applySnapshot(host.snapshot(105100), 105100);
    expect(guest.racers.get('guest')!.dist).toBe(100);
  });
  it('closes on host departure and keeps the roster for an explicit rematch', () => {
    const race = start();
    race.forceFinish(200000);
    expect(race.rematch()).toBe(true);
    expect(race.count).toBe(2);
    expect(race.racers.get('guest')!.ready).toBe(false);
    expect(race.canStart).toBe(false);
    race.removeParticipant('host');
    expect(race.phase).toBe('idle');
    expect(race.hostId).toBe('');
  });
  it('counts a finish when the line itself is crossed wide', () => {
    const race = start(1);
    tick(race, -6, 0);
    for (let d = 0; d <= TRACK_LENGTH - 8; d += 4) tick(race, d, (d + 4) * 100);
    // Drift wide across the line (10m off centerline, Z is lateral here): still a finish.
    const p = point(2);
    race.tickLocal(p.x, p.z + 10, race.startedAt + 70000);
    const me = race.racers.get('host')!;
    expect(me.finished).toBe(true);
    expect(race.hasFinisher).toBe(true);
    expect(race.firstFinisher?.id).toBe('host');
    expect(race.localFinished).toBe(true);
    expect(race.phase).toBe('racing');
  });
  it('keeps a local finish when a stale host snapshot arrives', () => {
    const host = start(1);
    const guest = new RaceSim();
    guest.joinAs('guest', 'Guest', 'car', 'host');
    guest.applySnapshot(host.snapshot(105000), 105000);
    for (let d = 0; d <= TRACK_LENGTH + 8; d += 4) tick(guest, d, 1000 + d * 100);
    expect(guest.racers.get('guest')!.finished).toBe(true);
    // Host heartbeat built before learning the finish must not wipe it.
    guest.applySnapshot(host.snapshot(105000), 200000);
    const me = guest.racers.get('guest')!;
    expect(me.finished).toBe(true);
    expect(guest.localFinished).toBe(true);
    expect(guest.hasFinisher).toBe(true);
    expect(guest.results()[0].id).toBe('guest');
  });
  it('merges remote finishes monotonically without freeze-out', () => {
    const race = start(1);
    race.upsertRemote({ ...remote(), lap: 1, checkpoint: 3, dist: 300, finished: true, finishMs: 90000, bestLapMs: 88000 });
    expect(race.hasFinisher).toBe(true);
    expect(race.firstFinisher?.id).toBe('guest');
    // Older duplicate must not clear the finish or regress progress.
    race.upsertRemote({ ...remote(), lap: 1, checkpoint: 1, dist: 100, finished: false, finishMs: 0, bestLapMs: 0 });
    const r = race.racers.get('guest')!;
    expect(r.finished).toBe(true);
    expect(r.finishMs).toBe(90000);
    expect(r.checkpoint).toBe(3);
    // A better lap still merges after the finish.
    race.upsertRemote({ ...remote(), lap: 1, checkpoint: 3, dist: 300, finished: true, finishMs: 90000, bestLapMs: 87000 });
    expect(race.racers.get('guest')!.bestLapMs).toBe(87000);
  });
  it('marks remaining racers DNF at the finish deadline', () => {
    const race = start();
    Object.assign(race.racers.get('host')!, { finished: true, finishMs: 1000 });
    expect(race.pollFinish(race.startedAt + 60999)).toBeNull();
    expect(race.pollFinish(race.startedAt + 61000)?.[1].dnf).toBe(true);
  });
});
