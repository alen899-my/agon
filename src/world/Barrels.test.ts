import { describe, expect, it } from 'vitest';
import { BarrelSim } from './Barrels';

describe('dynamic barrels physics', () => {
  it('initializes barrels around the racing arena', () => {
    const sim = new BarrelSim();
    expect(sim.barrels.length).toBeGreaterThanOrEqual(8);
    for (const b of sim.barrels) {
      expect(b.x).toBeLessThan(-20);
      expect(b.x).toBeGreaterThan(-70);
      expect(b.z).toBeGreaterThan(70);
      expect(b.z).toBeLessThan(95);
      expect(b.sleeping).toBe(true);
    }
  });

  it('launches a barrel into the air when struck by a vehicle', () => {
    const sim = new BarrelSim();
    const target = sim.barrels[0];
    const initialZ = target.z;

    // Simulate vehicle driving directly at the barrel from behind
    const hit = sim.checkVehicleHit(target.x, target.z - 2.0, 0, 15, 'sport');
    expect(hit).toBe(true);
    expect(target.sleeping).toBe(false);
    expect(target.vy).toBeGreaterThan(2.0); // Thrown upward into air
    expect(Math.abs(target.vz)).toBeGreaterThan(4.0); // High launch velocity
    expect(Math.abs(target.wPitch) + Math.abs(target.wRoll)).toBeGreaterThan(0.5); // Tumbling

    // Step physics forward: barrel flies through the air
    for (let i = 0; i < 20; i++) sim.update(1 / 60);
    expect(target.z).not.toBe(initialZ); // Displaced
  });

  it('bounces off ground, rolls, decelerates with friction, and settles to sleep', () => {
    const sim = new BarrelSim();
    const b = sim.barrels[0];
    b.sleeping = false;
    b.vy = 4.0;
    b.vz = 5.0;
    b.pitch = 0.5;

    // Step physics forward for 2.5 seconds (150 frames)
    for (let i = 0; i < 150; i++) sim.update(1 / 60);

    // Barrel should bounce, roll, slow down, and settle onto the ground
    expect(b.y).toBeCloseTo(b.radius, 1);
    expect(Math.hypot(b.vx, b.vy, b.vz)).toBeLessThan(0.5);
    expect(b.sleeping).toBe(true);
  });

  it('allows walking player to kick or nudge a barrel', () => {
    const sim = new BarrelSim();
    const b = sim.barrels[1];

    // Player running past the barrel
    const kicked = sim.checkPlayerHit(b.x, b.z - 0.4, 0, 3.5);
    expect(kicked).toBe(true);
    expect(b.sleeping).toBe(false);
    expect(b.vz).toBeGreaterThan(2.0);
  });

  it('transfers momentum between barrels in chain reaction', () => {
    const sim = new BarrelSim();
    const b1 = sim.barrels[0];
    const b2 = sim.barrels[1];

    // Place b1 and b2 right next to each other
    b1.x = -45; b1.z = 80; b1.sleeping = false; b1.vz = 6.0;
    b2.x = -45; b2.z = 80.5; b2.sleeping = true; b2.vz = 0;

    // Run physics step
    sim.update(1 / 60);

    // b1 hit b2 -> b2 should now be awake and moving forward
    expect(b2.sleeping).toBe(false);
    expect(b2.vz).toBeGreaterThan(1.0);
  });
});
