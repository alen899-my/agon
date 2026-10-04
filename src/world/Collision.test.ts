import { describe, expect, it } from 'vitest';
import { bodyContact, boundaryContact, circleContact, vehicleBody } from './Collision';
import { Simulation } from './Simulation';
import { SOLIDS, LIMIT, PROPS } from './Map';

const tick = (s: Simulation, n = 60) => { for (let i = 0; i < n; i++) s.update(1 / 60); };
function driving(x = 0, z = 40) {
  const s = new Simulation(); s.begin(); s.traffic = []; s.peds = []; s.parked = [];
  s.x = s.car.x = x; s.z = s.car.z = z; s.interact(); s.transition = 0; return s;
}
function expectClear(s: Simulation) {
  const body = vehicleBody(s.car.x, s.car.z, s.car.yaw, s.vehicleKind);
  expect(boundaryContact(body, LIMIT)).toBeNull();
  for (const box of SOLIDS) expect(bodyContact(body, { ...box, yaw: 0, halfWidth: box.w / 2, halfLength: box.d / 2 })).toBeNull();
}

describe('vehicle collision regressions', () => {
  it('covers bus corners without an oversized circular side collider', () => {
    const bus = vehicleBody(0, 0, Math.PI / 4, 'bus');
    expect(circleContact(bus, 2.8, -2.8, 0.2)).not.toBeNull();
    expect(circleContact(vehicleBody(0, 0, 0, 'van'), 2, 0, 0.4)).toBeNull();
    expect(bodyContact(vehicleBody(0, 0, 0, 'car'), vehicleBody(2.3, 0, 0, 'van'))).toBeNull();
  });
  it('stops at a lamp even at high speed and can reverse away', () => {
    const s = driving(-14, -53); s.car.speed = 40;
    s.update(0.25);
    const lamp = PROPS.find(p => p.x === -14 && p.z === -62)!;
    expect(circleContact(vehicleBody(s.car.x, s.car.z, s.car.yaw, s.vehicleKind), lamp.x, lamp.z, lamp.r)).toBeNull();
    expect(s.car.z).toBeGreaterThan(-59.46); expect(s.impact?.with).toBe('lamp');
    s.clearInput(); tick(s, 60); const z = s.z;
    s.setInput('back', true, 's'); tick(s, 60); expect(s.z).toBeGreaterThan(z + 1);
  });
  it('rejects rotation into walls and boundaries for a long vehicle', () => {
    for (const [x, z] of [[14.2, -22], [156.4, 0]]) {
      const s = driving(x, z); s.vehicleKind = 'bus'; s.car.speed = 8;
      s.setInput('right', true, 'd'); s.setInput('forward', true, 'w');
      for (let i = 0; i < 90; i++) { s.update(1 / 60); expectClear(s); }
    }
  });
  it('detects lateral drift impacts even without forward speed', () => {
    const s = driving(157, 0); s.lateralSpeed = 25;
    s.update(0.2); expectClear(s);
    expect(s.impact?.with).toBe('boundary'); expect(s.damage).toBeGreaterThan(0);
  });
  it('does not repeatedly bounce or gain damage while resting against a wall', () => {
    const s = driving(-26, -31); s.car.speed = 18; tick(s, 30);
    tick(s, 90); const damage = s.damage;
    tick(s, 180); expectClear(s); expect(s.damage).toBe(damage);
    expect(Math.abs(s.car.speed)).toBeLessThan(0.1);
    s.setInput('back', true, 's'); const z = s.z; tick(s, 60); expect(s.z).toBeGreaterThan(z + 1);
  });
  it('never teleports traffic when braking after a long session', () => {
    const s = new Simulation(); s.begin(); s.time = 1000;
    const t = s.traffic[0]; s.x = s.car.x = t.x + 7; s.z = s.car.z = t.z; s.car.yaw = t.yaw;
    s.interact(); const x = t.x, z = t.z, offset = t.offset;
    s.update(1 / 60);
    expect(Math.hypot(t.x - x, t.z - z)).toBeLessThan(0.13);
    expect(t.offset).toBeGreaterThanOrEqual(offset);
    tick(s, 180);
    expect(bodyContact(vehicleBody(t.x, t.z, t.yaw, t.kind), vehicleBody(s.car.x, s.car.z, s.car.yaw, s.vehicleKind))).toBeNull();
  }, 15000);
  it('chooses a clear exit door instead of exiting into a lamp', () => {
    const s = driving(10.1, 28); // right door lies at lamp (12, 28)
    s.transition = 0;
    expect(s.interact()).toBe(true);
    expect(s.x).toBeLessThan(s.car.x);
    expect(PROPS.some(p => Math.hypot(s.x - p.x, s.z - p.z) < p.r + 0.48)).toBe(false);
  });
  it('rejects a bigger vehicle overlapping a prop or a bus bumper', () => {
    const s = driving(-14, -59.8); s.vehicleKind = 'pickup';
    expect(s.cycleVehicle()).toBe(false); expect(s.vehicleKind).toBe('pickup');
  });
  it('ignores zero and invalid time steps instead of corrupting speed', () => {
    const s = driving();
    for (const dt of [0, -1, NaN, Infinity]) s.update(dt);
    expect(s.acceleration).toBe(0); expect(s.time).toBe(0); expect(s.pace).toBe(0);
  });
});
