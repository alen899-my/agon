import { describe, expect, it } from 'vitest';
import { Simulation, routePoint } from './Simulation';
import { BUILDINGS, intersects, PLACES, SOLIDS } from './Map';

const tick = (sim: Simulation, count = 60) => { for (let i = 0; i < count; i++) sim.update(1 / 60); };
const running = () => { const sim = new Simulation(); sim.begin(); return sim; };

describe('open district movement', () => {
  it('starts only on command and pauses without accumulating movement', () => {
    const sim = new Simulation(); sim.setInput('forward', true, 'w'); tick(sim); expect(sim.z).toBe(34);
    sim.begin(); sim.setInput('forward', true, 'w'); tick(sim); expect(sim.z).toBeLessThan(34);
    sim.togglePause(); const z = sim.z; tick(sim, 120); expect(sim.z).toBe(z);
    sim.togglePause(); tick(sim); expect(sim.z).toBe(z);
  });
  it('normalizes diagonal speed and combines independent sources', () => {
    const straight = running(), diagonal = running();
    straight.x = diagonal.x = 0; straight.z = diagonal.z = 50; straight.yaw = diagonal.yaw = 0;
    straight.setInput('forward', true, 'w'); diagonal.setInput('forward', true, 'w'); diagonal.setInput('right', true, 'd');
    tick(straight); tick(diagonal); expect(diagonal.distance).toBeCloseTo(straight.distance, 4);
    straight.setInput('forward', true, 'pad'); straight.setInput('forward', false, 'w');
    const before = straight.z; tick(straight); expect(straight.z).toBeLessThan(before);
  });
  it('supports joystick movement, sprinting, jumping and release', () => {
    const sim = running(); sim.x = 0; sim.z = 50; sim.yaw = 0;
    sim.setStick(0, -1); sim.setInput('sprint', true, 'shift'); tick(sim);
    expect(sim.distance).toBeCloseTo(8); sim.setStick(0, 0);
    sim.setInput('jump', true, 'space'); tick(sim, 12); expect(sim.y).toBeGreaterThan(0.5);
    tick(sim, 80); expect(sim.y).toBe(0);
    expect(sim.distance).toBeCloseTo(8);
  });
  it('blocks facades, slides along them, and bounds the map', () => {
    const sim = running(); sim.x = -26; sim.z = -36; sim.yaw = 0;
    sim.setInput('forward', true, 'w'); tick(sim, 100);
    expect(sim.z).toBeGreaterThanOrEqual(-38.5 + 0.48);
    expect(intersects(sim.x, sim.z, 0.48)).toBe(false);
    sim.setInput('right', true, 'd'); const x = sim.x; tick(sim, 30); expect(sim.x).toBeGreaterThan(x);
    sim.x = 111; sim.z = 0; sim.yaw = Math.PI / 2; sim.clearInput(); sim.setInput('forward', true, 'w'); tick(sim, 120);
    expect(sim.x).toBeLessThanOrEqual(112);
  });
  it('preserves position when changing perspective and clamps camera pitch', () => {
    const sim = running(); sim.toggleView(); expect(sim.view).toBe('first'); expect(sim.x).toBe(12);
    sim.look(100, 10000); expect(sim.pitch).toBe(0.85);
    sim.look(0, -20000); expect(sim.pitch).toBe(-0.7);
    sim.toggleView(); expect(sim.view).toBe('third');
  });
});
describe('vehicles and exploration', () => {
  it('enters a nearby car, drives, brakes and safely exits', () => {
    const sim = running(); expect(sim.nearbyCar).toBe(true); expect(sim.interact()).toBe(true);
    expect(sim.driving).toBe(true); const z = sim.z;
    sim.setInput('forward', true, 'w'); tick(sim); expect(sim.z).toBeLessThan(z);
    expect(sim.car.speed).toBeGreaterThan(0); expect(sim.car.x).toBe(sim.x);
    sim.clearInput(); tick(sim, 120); expect(sim.car.speed).toBeCloseTo(0);
    expect(sim.interact()).toBe(true); expect(sim.driving).toBe(false);
    expect(intersects(sim.x, sim.z, 0.48)).toBe(false);
  });
  it('rejects remote car entry and stops driving at buildings', () => {
    const sim = running(); sim.x = 50; sim.z = 0; expect(sim.interact()).toBe(false);
    sim.x = sim.car.x = -26; sim.z = sim.car.z = -31; sim.car.yaw = 0;
    sim.interact(); sim.setInput('forward', true, 'w'); tick(sim, 180);
    expect(sim.z).toBeGreaterThanOrEqual(-38.5 + 2.6); expect(sim.car.speed).toBe(0);
  });
  it('discovers a place once and reports waypoint state', () => {
    const sim = running(); const plaza = PLACES[0]; sim.x = plaza.x + 6; sim.z = plaza.z;
    tick(sim); tick(sim); expect(sim.snapshot.discovered).toEqual(['plaza']);
    sim.waypoint = 'station'; expect(sim.snapshot.waypoint).toBe('station');
  });
  it('keeps routes continuous across corners and loops', () => {
    const points = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];
    expect(routePoint(points, 5)).toEqual({ x: 5, z: 0, yaw: Math.PI / 2 });
    expect(routePoint(points, 40)).toEqual(routePoint(points, 0));
    const a = routePoint(points, 9.99), b = routePoint(points, 10.01);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.03);
  });
  it('provides a connected street network with a clear spawn and bounded reusable blocks', () => {
    expect(intersects(12, 34, 0.48)).toBe(false); expect(BUILDINGS.length).toBeGreaterThan(20);
    for (let v = -110; v <= 110; v += 5) {
      expect(intersects(0, v, 0.5)).toBe(false); expect(intersects(v, 0, 0.5)).toBe(false);
    }
    expect(SOLIDS.every(b => b.w > 0 && b.d > 0 && b.h > 0)).toBe(true);
  });
});
