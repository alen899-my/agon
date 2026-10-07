import { describe, expect, it } from 'vitest';
import { racePathAt, racePathLength } from '../../server/src/agents/racePath';
import { LivingWorld } from '../../server/src/agents/livingWorld';
import { CpuRacer } from './CpuRacer';
import { onRoad, intersects, inWater } from './Map';

describe('agent movement continuity', () => {
  it('keeps both rounded lanes on asphalt with continuous positions and headings', () => {
    for (const lane of [-2.2, 2.2]) {
      let previous = racePathAt(0, lane);
      expect(previous.x).toBeCloseTo(-66);
      for (let d = 0.2; d < racePathLength(lane) + 1; d += 0.2) {
        const p = racePathAt(d, lane);
        expect(Math.hypot(p.x - previous.x, p.z - previous.z)).toBeLessThanOrEqual(0.201);
        const turn = Math.atan2(Math.sin(p.yaw - previous.yaw), Math.cos(p.yaw - previous.yaw));
        expect(Math.abs(turn)).toBeLessThan(0.09);
        expect(onRoad(p.x, p.z)).toBe(true);
        expect(intersects(p.x, p.z, 1)).toBe(false);
        expect(inWater(p.x, p.z)).toBe(false);
        previous = p;
      }
    }
  });
  it('leaves the countdown grid without teleporting and brakes before corners', () => {
    const world = new LivingWorld(); world.directives.raceNow = true;
    world.tick(0.05, 50, { cops: [], members: [] });
    let previous = world.rideSnapshot(), braking = false, steering = false;
    for (let t = 100; t < 30000; t += 50) {
      world.tick(0.05, t, { cops: [], members: [] });
      const current = world.rideSnapshot();
      for (let i = 0; i < current.length; i++) {
        const p = current[i], old = previous[i];
        expect(Math.hypot(p.x - old.x, p.z - old.z)).toBeLessThanOrEqual(1.36);
        expect(Math.abs(p.speed - old.speed)).toBeLessThanOrEqual(0.401);
        braking ||= !!p.braking; steering ||= Math.abs(p.steer ?? 0) > 0.1;
      }
      previous = current;
    }
    expect(braking).toBe(true); expect(steering).toBe(true);
  });
  it('solo racers maintain forward-facing continuous motion through bends', () => {
    const cpu = new CpuRacer(0, 'sport', 240, 2, 'hard', 70, -2.2);
    let old = { x: cpu.x, z: cpu.z, yaw: cpu.yaw, speed: cpu.speed };
    for (let i = 1; i <= 1800; i++) {
      cpu.tick(1 / 60, 1000 + i * 1000 / 60, 1000, 2);
      const distance = Math.hypot(cpu.x - old.x, cpu.z - old.z);
      expect(distance).toBeLessThanOrEqual(0.76);
      const turn = Math.atan2(Math.sin(cpu.yaw - old.yaw), Math.cos(cpu.yaw - old.yaw));
      expect(Math.abs(turn)).toBeLessThan(0.1);
      if (distance > 0.01) {
        const movementYaw = Math.atan2(cpu.x - old.x, old.z - cpu.z);
        expect(Math.cos(movementYaw - cpu.yaw)).toBeGreaterThan(0.98);
      }
      old = { x: cpu.x, z: cpu.z, yaw: cpu.yaw, speed: cpu.speed };
    }
  });
});
