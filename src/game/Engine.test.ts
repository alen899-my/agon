import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from './GameLoop';
import { Engine } from './Engine';
import { Run } from './Run';
import { Input } from './Input';
import { WORLD } from './State';
import { createCourse, physique } from '../systems/LevelManager';
import { hazardBounds } from '../systems/Collision';

const step = (run: Run, frames = 1) => { for (let i = 0; i < frames; i++) run.update(1 / 60); };
const playing = () => { const run = new Run(); run.begin(); return run; };
const hold = (run: Run, action: 'left' | 'right' | 'jump' | 'punch', down = true) => run.input.set(action, down, action);

describe('controller and movement', () => {
  it('supports simultaneous fingers and independent keyboard sources', () => {
    const input = new Input();
    input.set('right', true, 'finger1'); input.set('jump', true, 'finger2'); input.set('right', true, 'keyD');
    input.set('right', false, 'finger1');
    expect(input.held('right')).toBe(true); expect(input.consume('jump')).toBe(true);
    expect(input.consume('jump')).toBe(false); input.clear(); expect(input.held('right')).toBe(false);
  });
  it('waits for start, accelerates, brakes and respects the left boundary', () => {
    const run = new Run(); hold(run, 'right'); step(run, 60); expect(run.player.x).toBe(160);
    run.begin(); hold(run, 'right'); step(run, 45); expect(run.player.x).toBeGreaterThan(330);
    hold(run, 'right', false); step(run, 20); expect(run.player.vx).toBe(0);
    hold(run, 'left'); step(run, 120); expect(run.player.x).toBe(24);
  });
  it('jumps while moving, lands, and does not auto-jump from a held button', () => {
    const run = playing(); hold(run, 'right'); hold(run, 'jump'); step(run, 20);
    expect(run.player.x).toBeGreaterThan(200); expect(run.player.y).toBeLessThan(410);
    hold(run, 'right', false); step(run, 80);
    expect(run.player.grounded).toBe(true); expect(run.player.y).toBe(WORLD.ground);
  });
  it('accepts a jump shortly after leaving a ledge (coyote time)', () => {
    const run = playing(); run.player.x = 1510; hold(run, 'right'); step(run, 5);
    expect(run.player.grounded).toBe(false); hold(run, 'jump'); step(run);
    expect(run.player.vy).toBeLessThan(0);
  });
  it('buffers a jump pressed just before landing', () => {
    const run = playing(); run.player.y = 505; run.player.vy = 300; run.player.grounded = false; run.player.coyote = 0;
    hold(run, 'jump'); step(run, 6); expect(run.player.vy).toBeLessThan(0);
  });
  it('clears held inputs on pause and leaves physics frozen', () => {
    const run = playing(); hold(run, 'right'); run.togglePause(); step(run, 120);
    expect(run.player.x).toBe(160); expect(run.time).toBe(0);
    run.togglePause(); step(run, 20); expect(run.player.x).toBe(160);
  });
});
describe('obstacles, checkpoints and growth', () => {
  it('can clear spikes, a moving saw and a pit with ordinary running jumps', () => {
    for (const [start, finish] of [[595, 790], [1205, 1370], [1470, 1680]]) {
      const run = playing(); run.player.x = start; run.player.vx = 285;
      hold(run, 'right'); hold(run, 'jump'); step(run, 47);
      expect(run.player.health).toBe(3);
      expect(run.player.x).toBeGreaterThan(finish);
      expect(run.player.grounded).toBe(true);
    }
  });
  it('can walk beneath a retracted crusher without taking damage', () => {
    const run = playing(); run.player.x = 1930; run.player.vx = 285;
    hold(run, 'right'); step(run, 35);
    expect(run.player.health).toBe(3); expect(run.player.x).toBeGreaterThan(2080);
  });
  it('spikes remove one heart, respawn safely, and give brief invulnerability', () => {
    const run = playing(); run.player.x = 660; step(run);
    expect(run.player.health).toBe(2); expect(run.player.x).toBe(160);
    run.player.x = 660; step(run); expect(run.player.health).toBe(2);
  });
  it('pits cause a fall and restore the checkpoint position', () => {
    const run = playing(); run.checkpointX = 1770; run.player.x = 2640;
    step(run, 70); expect(run.player.health).toBe(2); expect(run.player.x).toBe(1770);
  });
  it('stops at a wall and breaks it with repeated punches', () => {
    const run = playing(); run.player.x = 920; hold(run, 'right'); step(run, 30);
    expect(run.player.x).toBe(960); expect(run.course.walls[0].hp).toBe(2);
    hold(run, 'punch'); step(run, 30); expect(run.course.walls[0].hp).toBe(0);
    step(run, 10);
    expect(run.player.x).toBeGreaterThan(980);
  });
  it('crushers expose a safe window and a floor-reaching drop', () => {
    const crusher = createCourse(1).hazards.find(h => h.kind === 'crusher')!;
    expect(hazardBounds(crusher, 1, 1).y + hazardBounds(crusher, 1, 1).h).toBe(290);
    expect(hazardBounds(crusher, 2.3, 1).y + hazardBounds(crusher, 2.3, 1).h).toBe(520);
  });
  it('checkpoints survive defeat and retry, without skipping a level', () => {
    const run = playing(); run.player.x = 1800; step(run);
    expect(run.snapshot.checkpoint).toBe(true);
    run.player.health = 1; run.player.x = 2400; step(run); expect(run.phase).toBe('defeat');
    run.retry(); expect(run.player.x).toBe(1770); expect(run.player.health).toBe(3); expect(run.level).toBe(1);
  });
  it('collects each gain once, including after a retry, and heals every fourth', () => {
    const run = playing(); run.player.health = 1; run.gains = 3; run.player.x = 400; step(run);
    expect(run.gains).toBe(4); expect(run.player.health).toBe(2);
    run.phase = 'defeat'; run.retry(); run.player.x = 400; step(run); expect(run.gains).toBe(4);
  });
  it('requires reaching the exit and upgrades physique, strength and course on continue', () => {
    const run = playing(); run.next(); expect(run.level).toBe(1);
    run.player.x = run.course.finish; step(run); expect(run.phase).toBe('complete');
    run.next(); expect(run.level).toBe(2); expect(run.player.health).toBe(3);
    expect(run.snapshot.strength).toBe(2); expect(physique(2).muscle).toBeGreaterThan(physique(1).muscle);
    expect(run.phase).toBe('playing'); expect(run.player.x).toBe(160);
  });
  it('keeps later courses bounded and gaps inside the jump range', () => {
    for (const level of [1, 2, 8, 100, 10000]) {
      const course = createCourse(level);
      expect(course.width).toBeLessThanOrEqual(5450);
      expect(Number.isFinite(physique(level).muscle)).toBe(true);
      for (let i = 1; i < course.platforms.length; i++) {
        const previous = course.platforms[i - 1];
        expect(course.platforms[i].x - previous.x - previous.w).toBeLessThan(180);
      }
    }
  });
});

describe('browser adapter and fixed clock', () => {
  let callback: FrameRequestCallback;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => { callback = cb; return 1; }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());
  it('simulates the same elapsed time at 30, 60 and 144 Hz', () => {
    for (const fps of [30, 60, 144]) {
      let elapsed = 0;
      const loop = new GameLoop(dt => elapsed += dt, () => {}); loop.start(); callback(0);
      for (let frame = 1; frame <= fps * 10; frame++) callback(frame * 1000 / fps);
      expect(Math.abs(elapsed - 10)).toBeLessThan(1 / 60 + 0.0001); loop.stop();
    }
  });
  it('limits stall catch-up and resets timestamps when resumed', () => {
    const update = vi.fn(); const loop = new GameLoop(update, () => {});
    loop.start(); callback(0); callback(60000); expect(update.mock.calls.length).toBeLessThanOrEqual(6);
    loop.stop(); update.mockClear(); loop.start(); callback(120000); expect(update).not.toHaveBeenCalled(); loop.stop();
  });
  it('caps backing resolution and clears touch input during orientation suspension', () => {
    const context = new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D;
    const canvas = { width: 1, height: 1, getContext: () => context } as unknown as HTMLCanvasElement;
    const engine = new Engine(canvas, () => {}); engine.resize(800, 400, 3);
    expect(canvas.width).toBe(1600); expect(canvas.height).toBe(800);
    engine.begin(); engine.input('right', true, 'touch:1'); engine.setSuspended(true);
    expect(engine.run.input.held('right')).toBe(false);
    engine.input('right', true, 'touch:1'); expect(engine.run.input.held('right')).toBe(false); engine.destroy();
  });
});
