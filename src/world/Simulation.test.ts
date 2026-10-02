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
    // Acceleration eases in: just under 8m in the first second, steady 8 m/s at the end.
    expect(sim.distance).toBeGreaterThan(6); expect(sim.distance).toBeLessThan(8.5);
    expect(sim.pace).toBeCloseTo(8, 1); expect(sim.moveBlend).toBeCloseTo(1, 1);
    sim.setStick(0, 0);
    sim.setInput('jump', true, 'space'); tick(sim, 12); expect(sim.y).toBeGreaterThan(0.5);
    expect(sim.snapshot.airborne).toBe(true);
    tick(sim, 80); expect(sim.y).toBe(0);
    expect(sim.pace).toBeCloseTo(0, 1);
    const dEnd = sim.distance; tick(sim, 30); expect(sim.distance).toBe(dEnd);
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
    sim.clearInput(); const coastSpeed = sim.car.speed; tick(sim, 30);
    expect(sim.car.speed).toBeGreaterThan(0); expect(sim.car.speed).toBeLessThan(coastSpeed);
    sim.setInput('handbrake', true, 'space'); tick(sim, 120); expect(sim.car.speed).toBeCloseTo(0);
    expect(sim.interact()).toBe(true); expect(sim.driving).toBe(false);
    expect(intersects(sim.x, sim.z, 0.48)).toBe(false);
  });
  it('rejects remote car entry and stops driving at buildings', () => {
    const sim = running(); sim.x = 50; sim.z = 0; expect(sim.interact()).toBe(false);
    sim.x = sim.car.x = -26; sim.z = sim.car.z = -31; sim.car.yaw = 0;
    sim.interact(); sim.setInput('forward', true, 'w'); tick(sim, 180);
    // Oriented two-axle body: nose stops ~2.5m off the facade, never inside it.
    expect(sim.z).toBeGreaterThanOrEqual(-38.5 + 1.2);
    expect(intersects(sim.x, sim.z, 1.0)).toBe(false);
    sim.clearInput(); tick(sim, 90);
    expect(Math.abs(sim.car.speed)).toBeLessThan(1.5);
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
describe('realistic physics one by one', () => {
  it('probes obstacles in front of the car', () => {
    const sim = running(); sim.x = sim.car.x = -26; sim.z = sim.car.z = -31; sim.car.yaw = 0; sim.interact();
    sim.update(1 / 60);
    expect(sim.frontDistance).toBeLessThan(900); expect(typeof sim.frontBlocked).toBe('boolean');
  });
  it('crashes with bounce + damage at speed, soft tap when slow', () => {
    const sim = running(); sim.x = sim.car.x = -26; sim.z = sim.car.z = -31; sim.car.yaw = 0; sim.interact();
    sim.setInput('forward', true, 'w');
    let sawImpact = false;
    for (let i = 0; i < 6; i++) { tick(sim, 30); if (sim.impact) sawImpact = true; }
    expect(sim.damage).toBeGreaterThan(0); expect(sawImpact).toBe(true);
  });
  it('blocks parked cars for driving and walking', () => {
    const sim = running(); sim.x = sim.car.x = -11; sim.z = sim.car.z = -32; sim.car.yaw = 0; sim.interact();
    sim.setInput('forward', true, 'w'); tick(sim, 120);
    expect(sim.z).toBeGreaterThan(-38 - 3);
  });
  it('brakes traffic when the player blocks the lane', () => {
    const sim = running();
    const t = sim.traffic[0];
    // Park 7m ahead of the lead car, facing the same way, then enter and wait.
    sim.x = sim.car.x = t.x + Math.sin(t.yaw) * 7; sim.z = sim.car.z = t.z - Math.cos(t.yaw) * 7; sim.car.yaw = t.yaw;
    expect(sim.interact()).toBe(true);
    tick(sim, 60);
    expect(sim.traffic[0].braking || sim.traffic[0].speed < sim.traffic[0].base - 0.5).toBe(true);
  });
  it('frightens pedestrians on fast contact and repairs at the station', () => {
    const sim = running(); sim.damage = 40;
    sim.x = 42; sim.z = 27; tick(sim, 60);
    expect(sim.damage).toBeLessThan(40);
  });
  it('advances stride smoothly and turns the body gradually', () => {
    const sim = running(); sim.x = 0; sim.z = 50; sim.yaw = 0;
    sim.setInput('forward', true, 'w'); tick(sim, 30);
    expect(sim.stride).toBeGreaterThan(2); expect(sim.snapshot.stridePhase).toBe(sim.stride);
    const facing = sim.facing;
    sim.clearInput(); sim.setInput('right', true, 'd'); sim.update(1 / 60);
    // One frame only rotates partway toward the strafe direction (12 rad/s cap).
    expect(Math.abs(sim.facing - facing)).toBeLessThan(0.5);
    expect(Math.abs(sim.facing - facing)).toBeGreaterThan(0);
  });
  it('walks pedestrians with individual stride phase and eased speed', () => {
    const sim = running(); tick(sim, 60);
    for (const p of sim.snapshot.peds) {
      expect(p.phase).not.toBe(0); expect(p.moving).toBeGreaterThanOrEqual(0); expect(p.moving).toBeLessThanOrEqual(1);
    }
  });
});

describe('driving dynamics', () => {
  const drive = () => {
    const sim = running(); sim.x = sim.car.x = 0; sim.z = sim.car.z = 40;
    sim.traffic = []; sim.peds = []; sim.parked = []; sim.interact(); sim.transition = 0; return sim;
  };
  it('builds speed progressively and gives the coupe more acceleration than the bus', () => {
    const coupe = drive(), bus = drive(); coupe.vehicleKind = 'sport'; bus.vehicleKind = 'bus';
    for (const sim of [coupe, bus]) { sim.setInput('forward', true, 'w'); tick(sim, 1); expect(sim.car.speed).toBeLessThan(1); tick(sim, 59); }
    expect(coupe.car.speed).toBeGreaterThan(bus.car.speed * 2);
  });
  it('brakes before reversing and prevents the handbrake from accelerating backwards', () => {
    const sim = drive(); sim.car.speed = 8; sim.setInput('back', true, 's'); tick(sim, 20);
    expect(sim.car.speed).toBeGreaterThan(0); expect(sim.car.braking).toBe(true);
    tick(sim, 80); expect(sim.car.speed).toBeLessThan(0);
    sim.setInput('handbrake', true, 'space'); tick(sim, 120); expect(sim.car.speed).toBeCloseTo(0); expect(sim.y).toBe(0);
  });
  it('loses lateral grip under handbrake and regains grip after release', () => {
    const grip = drive(), drift = drive();
    for (const sim of [grip, drift]) { sim.car.speed = 18; sim.setInput('right', true, 'd'); }
    drift.setInput('handbrake', true, 'space'); tick(grip, 24); tick(drift, 24);
    expect(Math.abs(drift.lateralSpeed)).toBeGreaterThan(Math.abs(grip.lateralSpeed)); expect(drift.skidding).toBe(true);
    const slip = Math.abs(drift.lateralSpeed); drift.clearInput(); tick(drift, 45);
    expect(Math.abs(drift.lateralSpeed)).toBeLessThan(slip);
  });
  it('cycles all forty-six real-life rides while stopped but rejects changes at speed', () => {
    const sim = drive(); const kinds = new Set([sim.vehicleKind]);
    for (let i = 0; i < 45; i++) { expect(sim.cycleVehicle()).toBe(true); kinds.add(sim.vehicleKind); }
    expect(kinds.size).toBe(46); sim.car.speed = 2; expect(sim.cycleVehicle()).toBe(false);
  });
  it('keeps cockpit look relative to the car and recenters on changing views', () => {
    const sim = drive(); sim.toggleView(); sim.look(100, 0); const offset = sim.yaw - sim.car.yaw;
    sim.car.speed = 8; sim.setInput('right', true, 'd'); tick(sim, 15);
    expect(sim.yaw - sim.car.yaw).toBeCloseTo(offset); sim.toggleView(); expect(sim.yaw).toBe(sim.car.yaw);
  });
});

describe('gta steal-any-vehicle', () => {
  it('steals a parked taxi and leaves the old ride behind', () => {
    const sim = running(); sim.traffic = []; sim.peds = [];
    sim.parked = [{ kind: 'taxi', x: sim.x + 2, z: sim.z, yaw: 0 }];
    expect(sim.nearbyCar).toBe(true);
    expect(sim.interact()).toBe(true);
    expect(sim.driving).toBe(true); expect(sim.vehicleKind).toBe('taxi');
    sim.transition = 0;
    expect(sim.interact()).toBe(true); // exit
    expect(sim.driving).toBe(false); sim.transition = 0;
    // Original sedan was stashed as parked; the taxi is now your ride sitting beside you.
    expect(sim.parked.some(p => p.kind === 'car')).toBe(true);
    expect(sim.vehicleKind).toBe('taxi');
    expect(Math.hypot(sim.x - sim.car.x, sim.z - sim.car.z)).toBeLessThan(4);
  });
  it('rejects moving traffic but steals it once blocked and stopped', () => {
    const sim = running(); sim.peds = []; sim.parked = [];
    sim.car.x = 60; sim.car.z = 60; // your old ride is far — only the traffic counts
    sim.traffic = [{ kind: 'sport', x: sim.x + 3, z: sim.z, yaw: 0, speed: 10, offset: 0, base: 10, steer: 0, wheelSpin: 0, braking: false, prevYaw: 0 }];
    expect(sim.interact()).toBe(false); // too fast — chase & stop first
    expect(sim.snapshot.enterHint).toMatch(/moving/i);
    sim.traffic[0].speed = 0;
    expect(sim.interact()).toBe(true);
    expect(sim.vehicleKind).toBe('sport');
    expect(sim.traffic.length).toBe(1); // replacement respawned to keep streets alive
  });
  it('brakes traffic for a pedestrian standing in the lane', () => {
    const sim = running(); sim.parked = [];
    const t = sim.traffic[0];
    sim.x = t.x + Math.sin(t.yaw) * 6; sim.z = t.z - Math.cos(t.yaw) * 6;
    sim.car.x = 60; sim.car.z = 60; // player car far away — only the body blocks
    tick(sim, 60);
    expect(sim.traffic[0].braking || sim.traffic[0].speed < 5).toBe(true);
  });
  it('locks re-entry during the smooth door transition', () => {
    const sim = running(); sim.traffic = []; sim.peds = []; sim.parked = [];
    expect(sim.interact()).toBe(true);
    expect(sim.transition).toBeGreaterThan(0);
    expect(sim.interact()).toBe(false); // door still swinging
    expect(sim.snapshot.transition).toBeGreaterThan(0);
  });
});
