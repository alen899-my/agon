import { describe, expect, it } from 'vitest';
import { BasketballSim, BB } from './Basketball';

function shootAt(power: number): BasketballSim {
  const s = new BasketballSim();
  s.shoot(power);
  for (let i = 0; i < 600; i++) {
    s.update(1 / 60);
    if (s.phase === 'done') break;
  }
  return s;
}
/** Scan power 0..1 for makes; returns sorted list of swish powers. */
function swishWindow(): number[] {
  const hits: number[] = [];
  for (let p = 0.2; p <= 0.95; p += 0.02) {
    let makes = 0;
    for (let rep = 0; rep < 3; rep++) {
      const s = shootAt(p);
      if (s.makes > 0) makes += 1;
    }
    if (makes >= 2) hits.push(Number(p.toFixed(2)));
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
  it('tracks makes, streaks and best across shots', () => {
    const window = swishWindow();
    expect(window.length).toBeGreaterThan(0);
    const sweet = window[Math.floor(window.length / 2)];
    const s = new BasketballSim();
    s.shoot(sweet);
    for (let i = 0; i < 600 && s.phase !== 'done'; i++) s.update(1 / 60);
    expect(s.makes).toBe(1); expect(s.streak).toBe(1); expect(s.attempts).toBe(1);
    s.setupHold(); s.shoot(0.1);
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
