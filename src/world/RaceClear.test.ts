import { describe, expect, it } from 'vitest';
import { Simulation, GRID_BUBBLE_RADIUS } from './Simulation';
import { RACE_SHOW_CARS } from './Map';
import { START_OFFSET, TRACK_LENGTH, gridSlots, startLine } from './Track';
import { routePoint } from './Simulation';

function isShowCar(x: number, z: number): boolean {
  return RACE_SHOW_CARS.some((s) => Math.hypot(x - s.x, z - s.z) < 2);
}

function bubbleViolation(sim: Simulation): string | null {
  const s = startLine();
  for (const p of sim.parked) {
    if (Math.hypot(p.x - s.x, p.z - s.z) < GRID_BUBBLE_RADIUS) return `parked at (${p.x},${p.z}) in bubble`;
    for (const slot of gridSlots()) {
      if (Math.hypot(p.x - slot.x, p.z - slot.z) < GRID_BUBBLE_RADIUS) return `parked at (${p.x},${p.z}) in bubble`;
    }
  }
  for (const t of sim.traffic) {
    if (Math.hypot(t.x - s.x, t.z - s.z) < GRID_BUBBLE_RADIUS) return `traffic at (${t.x},${t.z}) in bubble`;
    for (const slot of gridSlots()) {
      if (Math.hypot(t.x - slot.x, t.z - slot.z) < GRID_BUBBLE_RADIUS) return `traffic at (${t.x},${t.z}) in bubble`;
    }
  }
  return null;
}

describe('race-clear grid bubble', () => {
  it('hides the 6 paddock show cars while active and restores them after', () => {
    const sim = new Simulation();
    sim.begin();
    expect(sim.parked.filter((p) => isShowCar(p.x, p.z)).length).toBe(6);

    sim.setRaceClear(true);
    expect(sim.raceClearActive).toBe(true);
    expect(sim.parked.filter((p) => isShowCar(p.x, p.z)).length).toBe(0);
    expect(bubbleViolation(sim)).toBeNull();

    sim.setRaceClear(false);
    expect(sim.raceClearActive).toBe(false);
    expect(sim.parked.filter((p) => isShowCar(p.x, p.z)).length).toBe(6);
  });

  it('sweeps player-dropped cars off the grid and restores them', () => {
    const sim = new Simulation();
    sim.begin();
    const slot = gridSlots()[0];
    const before = sim.parked.length;
    sim.parked.push({ kind: 'car', x: slot.x, z: slot.z, yaw: 0 });
    expect(sim.parked.length).toBe(before + 1);

    sim.setRaceClear(true);
    expect(bubbleViolation(sim)).toBeNull();

    sim.setRaceClear(false);
    expect(sim.parked.length).toBe(before + 1);
  });

  it('holds traffic outside the bubble instead of driving through the start line', () => {
    const sim = new Simulation();
    sim.begin();
    sim.setRaceClear(true);
    // Park a traffic car 40m before the start line heading toward it.
    const t = sim.traffic[0];
    const approachOffset = (START_OFFSET - 40 + TRACK_LENGTH) % TRACK_LENGTH;
    const p = routePoint(
      [
        { x: -136, z: 76 }, { x: -60, z: 76 }, { x: 0, z: 76 }, { x: 76, z: 76 },
        { x: 76, z: 0 }, { x: 76, z: -76 }, { x: 136, z: -76 }, { x: 136, z: -136 },
        { x: 0, z: -136 }, { x: -136, z: -136 }, { x: -136, z: 0 },
      ],
      approachOffset,
    );
    t.offset = approachOffset;
    t.x = p.x; t.z = p.z; t.yaw = p.yaw; t.speed = 7; t.base = 7;
    // Drive long enough to reach the line if unheld (40m @ ~7m/s).
    for (let i = 0; i < 600; i++) sim.update(1 / 60);
    expect(sim.nearGridBubble(t.x, t.z, GRID_BUBBLE_RADIUS)).toBe(false);
    sim.setRaceClear(false);
  });

  it('is idempotent across repeated toggles', () => {
    const sim = new Simulation();
    sim.begin();
    const before = sim.parked.length;
    sim.setRaceClear(true);
    sim.setRaceClear(true);
    expect(sim.parked.filter((p) => isShowCar(p.x, p.z)).length).toBe(0);
    sim.setRaceClear(false);
    expect(sim.parked.length).toBe(before);
    expect(sim.parked.filter((p) => isShowCar(p.x, p.z)).length).toBe(6);
  });
});
