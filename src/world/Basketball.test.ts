import { describe, expect, it } from 'vitest';
import { BasketballSim, BB } from './Basketball';

const lane = new BasketballSim();
lane.setSpot(4.2, 0); // one solved lane reused by all scan shots
function shootAt(power: number): BasketballSim {
  lane.setupHold(true);
  lane.shoot(power);
  for (let i = 0; i < 600; i++) {
    lane.update(1 / 60);
    if (lane.phase === 'done') break;
  }
  return lane;
}
/** Scan power 0..1 for makes; returns sorted list of swish powers. */
function swishWindow(): number[] {
  const hits: number[] = [];
  for (let p = 0.2; p <= 0.95; p += 0.02) {
    const before = lane.makes;
    shootAt(p);
    if (lane.makes > before) hits.push(Number(p.toFixed(2)));
  }
  return hits;
}

describe('basketball physics', () => {
  it('has a swish power window between short and long misses', () => {
    const window = swishWindow();
    expect(window.length).toBeGreaterThan(0); // a perfect release drops clean
    const soft = shootAt(0.1);
    expect(soft.makes).toBe(0); // falls short
    const full = shootAt(1.0);
    expect(full.makes).toBe(0); // sails long
  });
  it('loses energy on rim contact (restitution < 1)', () => {
    const s = new BasketballSim();
    s.phase = 'flight';
    s.ball = { x: BB.RIM_R, y: BB.RIM_H + 0.25, z: 0 };
    s.vel = { x: 0, y: -3, z: 0 };
    const before = 3;
    for (let i = 0; i < 120; i++) s.update(1 / 240);
    const after = Math.hypot(s.vel.x, s.vel.y, s.vel.z);
    expect(s.rimTouched).toBe(true);
    expect(after).toBeLessThan(before);
  });
  it('banks off the backboard (vz reverses on contact)', () => {
    const s = new BasketballSim();
    s.phase = 'flight';
    s.ball = { x: 0, y: 3.4, z: -0.5 };
    s.vel = { x: 0, y: 0.5, z: 5 };
    for (let i = 0; i < 120 && !s.boardTouched; i++) s.update(1 / 240);
    expect(s.boardTouched).toBe(true);
    expect(s.vel.z).toBeLessThan(0); // rebounding off the glass
  });
  it('moves the green window with distance and solves per spot', () => {
    const near = new BasketballSim(); near.setSpot(3.2, 0);
    const far = new BasketballSim(); far.setSpot(6.0, 0);
    const nearGreen = near.snapshot;
    const farGreen = far.snapshot;
    expect(farGreen.greenLo + farGreen.greenHi).toBeGreaterThan(nearGreen.greenLo + nearGreen.greenHi);
    // Green sits inside the meter with real width.
    expect(nearGreen.greenHi).toBeGreaterThan(nearGreen.greenLo);
    expect(farGreen.greenLo).toBeGreaterThanOrEqual(0);
    expect(farGreen.greenHi).toBeLessThanOrEqual(1);
    // Stopping mid-green drops at any spot (majority of 5; release wobble varies).
    for (const sim of [near, far]) {
      const mid = (sim.snapshot.greenLo + sim.snapshot.greenHi) / 2;
      let scored = 0;
      for (let rep = 0; rep < 5; rep++) {
        const before = sim.makes;
        sim.setupHold(true); sim.shoot(mid);
        for (let i = 0; i < 600 && sim.phase !== 'done'; i++) sim.update(1 / 60);
        if (sim.makes > before) scored += 1;
      }
      expect(scored).toBeGreaterThanOrEqual(3);
    }
  });
  it('tracks makes, streaks and best across shots', () => {
    const window = swishWindow();
    expect(window.length).toBeGreaterThan(0);
    const sweet = window[Math.floor(window.length / 2)];
    const s = new BasketballSim();
    s.setSpot(4.2, 0);
    s.shoot(sweet);
    for (let i = 0; i < 600 && s.phase !== 'done'; i++) s.update(1 / 60);
    expect(s.makes).toBe(1); expect(s.streak).toBe(1); expect(s.attempts).toBe(1);
    s.setupHold(true); s.shoot(0.1);
    for (let i = 0; i < 600 && s.phase !== 'done'; i++) s.update(1 / 60);
    expect(s.streak).toBe(0); expect(s.best).toBe(1); expect(s.attempts).toBe(2);
  });
  it('pumps the meter on first tap and throws on second tap', () => {
    const s = new BasketballSim();
    s.pressMeter(); // tap 1: pump starts
    expect(s.pumping).toBe(true);
    for (let i = 0; i < 90; i++) s.update(1 / 60);
    expect(s.power).toBeGreaterThan(0.5);
    expect(s.power).toBeLessThanOrEqual(1);
    s.pressMeter(); // tap 2: throw
    expect(s.pumping).toBe(false);
    expect(s.phase).toBe('flight'); expect(s.attempts).toBe(1);
  });
  it('drops through the net to the floor after a make', () => {
    const window = swishWindow();
    expect(window.length).toBeGreaterThan(0);
    const s = new BasketballSim();
    s.setSpot(4.2, 0);
    s.shoot(window[Math.floor(window.length / 2)]);
    let sawBelowRim = false;
    for (let i = 0; i < 600; i++) {
      s.update(1 / 60);
      if (s.makes > 0 && s.ball.y < BB.RIM_H - 0.3) sawBelowRim = true;
      if (s.phase === 'done') break;
    }
    expect(s.makes).toBe(1);
    expect(sawBelowRim).toBe(true); // fell through, not frozen at the rim
    expect(s.phase).toBe('done');
  });
});
