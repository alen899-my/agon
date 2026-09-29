import { describe, expect, it } from 'vitest';
import { BasketballSim } from './Basketball';

describe('debug2', () => {
  it('prints lane scan', () => {
    const near = new BasketballSim(); near.setSpot(3.2, 0);
    const far = new BasketballSim(); far.setSpot(6.0, 0);
    // eslint-disable-next-line no-console
    console.log('near green', near.snapshot.greenLo.toFixed(3), near.snapshot.greenHi.toFixed(3), near.spotLabel);
    // eslint-disable-next-line no-console
    console.log('far green', far.snapshot.greenLo.toFixed(3), far.snapshot.greenHi.toFixed(3), far.spotLabel);
    const lane = new BasketballSim();
    lane.setSpot(4.2, 0);
    // eslint-disable-next-line no-console
    console.log('green', lane.snapshot.greenLo.toFixed(3), lane.snapshot.greenHi.toFixed(3));
    for (const p of [0.5, 0.7, 0.78, 0.85]) {
      lane.setupHold(true);
      lane.shoot(p);
      for (let i = 0; i < 600 && lane.phase !== 'done'; i++) lane.update(1 / 60);
      // eslint-disable-next-line no-console
      console.log(`p=${p} makes=${lane.makes} msg=${lane.message} attempts=${lane.attempts}`);
    }
    expect(true).toBe(true);
  });
});
