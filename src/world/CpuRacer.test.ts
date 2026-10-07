import { describe, expect, it } from 'vitest';
import { CpuRacer, CPU_DIFFICULTIES, CPU_RACER_ID_PREFIX } from './CpuRacer';
import { RaceSim } from './RaceSim';
import { TRACK_LENGTH } from './Track';

describe('CpuRacer AI Driver', () => {
  it('initializes with correct properties and difficulty parameters', () => {
    const cpu = new CpuRacer(0, 'sport', 200, 3, 'medium', 100, 1.8);
    expect(cpu.id).toBe(`${CPU_RACER_ID_PREFIX}0`);
    expect(cpu.name).toBe('Ghost');
    expect(cpu.vehicleKind).toBe('sport');
    expect(cpu.laneOffset).toBe(1.8);
    expect(cpu.state.lap).toBe(1);
    expect(cpu.state.checkpoint).toBe(0);
    expect(cpu.state.finished).toBe(false);
    expect(cpu.state.isLocal).toBe(false);
  });

  it('stays stopped during countdown before race start', () => {
    const cpu = new CpuRacer(1, 'super', 260, 2, 'hard', 50, -1.8);
    const initialX = cpu.x;
    const initialZ = cpu.z;
    const startedAt = 10_000;
    // Tick with nowMs <= startedAt (countdown)
    const finished = cpu.tick(0.016, 8_000, startedAt, 2);
    expect(finished).toBe(false);
    expect(cpu.speed).toBe(0);
    expect(cpu.x).toBe(initialX);
    expect(cpu.z).toBe(initialZ);
  });

  it('accelerates and advances along track once race starts', () => {
    const cpu = new CpuRacer(2, 'muscle', 220, 2, 'medium', 50, 0);
    const startX = cpu.x;
    const startZ = cpu.z;
    const startedAt = 1_000;

    // Simulate several frames of driving
    let now = startedAt + 16;
    for (let i = 0; i < 60; i++) {
      cpu.tick(0.016, now, startedAt, 2);
      now += 16;
    }

    expect(cpu.speed).toBeGreaterThan(0);
    const movedDist = Math.hypot(cpu.x - startX, cpu.z - startZ);
    expect(movedDist).toBeGreaterThan(5);
  });

  it('applies lateral lane offset', () => {
    const center = new CpuRacer(0, 'sport', 200, 1, 'hard', 100, 0);
    const leftLane = new CpuRacer(1, 'sport', 200, 1, 'hard', 100, -2.5);
    const rightLane = new CpuRacer(2, 'sport', 200, 1, 'hard', 100, 2.5);

    const distLeftCenter = Math.hypot(leftLane.x - center.x, leftLane.z - center.z);
    const distRightCenter = Math.hypot(rightLane.x - center.x, rightLane.z - center.z);

    expect(distLeftCenter).toBeCloseTo(2.5, 1);
    expect(distRightCenter).toBeCloseTo(2.5, 1);
  });

  it('detects finish when completing requested total laps', () => {
    const cpu = new CpuRacer(0, 'sport', 300, 1, 'hard', 0, 0);
    const startedAt = 1_000;
    let now = startedAt + 100;
    let finished = false;

    // Allow braking for the district's tight street corners, not a flat-out lap.
    for (let i = 0; i < 10000; i++) {
      finished = cpu.tick(0.02, now, startedAt, 1);
      now += 20;
      if (finished) break;
    }

    expect(finished).toBe(true);
    expect(cpu.state.finished).toBe(true);
    expect(cpu.state.finishMs).toBeGreaterThan(0);
    expect(cpu.state.bestLapMs).toBeGreaterThan(0);
  });

  it('resets cleanly for a rematch', () => {
    const cpu = new CpuRacer(0, 'sport', 200, 2, 'medium', 100, 1.8);
    // Simulate some driving
    cpu.tick(1.0, 2000, 1000, 2);
    expect(cpu.speed).toBeGreaterThan(0);

    // Reset to start slot
    cpu.reset(100, 5000);
    expect(cpu.speed).toBe(0);
    expect(cpu.state.lap).toBe(1);
    expect(cpu.state.checkpoint).toBe(0);
    expect(cpu.state.finished).toBe(false);
  });
});

describe('Solo RaceSim integration', () => {
  it('creates a solo race lobby with CPU bots', () => {
    const race = new RaceSim();
    const cpuIds = ['cpu-0', 'cpu-1'];
    const cpuNames = ['Ghost', 'Neon'];
    const cpuKinds = ['sport', 'muscle'];

    race.createSolo('player-1', 'Ace', 'super', 3, cpuIds, cpuNames, cpuKinds);

    expect(race.isSolo).toBe(true);
    expect(race.isHost).toBe(true);
    expect(race.laps).toBe(3);
    expect(race.count).toBe(3);

    const player = race.racers.get('player-1');
    expect(player?.isLocal).toBe(true);
    expect(player?.ready).toBe(true);

    const bot0 = race.racers.get('cpu-0');
    expect(bot0?.isLocal).toBe(false);
    expect(bot0?.name).toBe('Ghost');
    expect(bot0?.vehicleKind).toBe('sport');

    // Solo mode is always ready and can start immediately
    expect(race.allReady).toBe(true);
    expect(race.canStart).toBe(true);
  });

  it('syncs CPU state without letting network override bot racers', () => {
    const race = new RaceSim();
    race.createSolo('player-1', 'Ace', 'super', 2, ['cpu-0'], ['Ghost'], ['sport']);

    race.syncCpuState('cpu-0', {
      lap: 2,
      checkpoint: 4,
      dist: 1500,
      bestLapMs: 45000,
    });

    const bot = race.racers.get('cpu-0');
    expect(bot?.lap).toBe(2);
    expect(bot?.checkpoint).toBe(4);
    expect(bot?.dist).toBe(1500);
    expect(bot?.bestLapMs).toBe(45000);

    // Network injection with cpu- id must be rejected
    race.upsertRemote({
      id: 'cpu-0',
      name: 'Hacker',
      vehicleKind: 'van',
      lap: 99,
      checkpoint: 99,
      dist: 99999,
      finished: true,
      finishMs: 1,
      bestLapMs: 1,
      ready: true,
      isLocal: false,
    });

    expect(race.racers.get('cpu-0')?.name).toBe('Ghost');
    expect(race.racers.get('cpu-0')?.lap).toBe(2);
  });

  it('rematch preserves solo mode and resets participant states', () => {
    const race = new RaceSim();
    race.createSolo('player-1', 'Ace', 'super', 2, ['cpu-0'], ['Ghost'], ['sport']);
    race.startCountdown(1000);
    race.pollCountdown(1000 + 4200 + 50);

    // Mark all finished
    const me = race.racers.get('player-1')!;
    me.finished = true;
    me.finishMs = 60000;
    const bot = race.racers.get('cpu-0')!;
    bot.finished = true;
    bot.finishMs = 62000;

    race.pollFinish(Date.now());
    expect(race.phase).toBe('finished');

    const rematchOk = race.rematch();
    expect(rematchOk).toBe(true);
    expect(race.phase).toBe('lobby');
    expect(race.isSolo).toBe(true);
    expect(race.racers.get('player-1')?.finished).toBe(false);
    expect(race.racers.get('cpu-0')?.finished).toBe(false);
    expect(race.canStart).toBe(true);
  });
});
