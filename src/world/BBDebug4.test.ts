import { describe, expect, it } from 'vitest';
import { BasketballSim } from './Basketball';

describe('debug4', () => {
  it('near and far mid-green reps', () => {
    for (const [dist, tag] of [[3.2, 'near'], [6.0, 'far']] as const) {
      const sim = new BasketballSim();
      sim.setSpot(dist, 0);
      const mid = (sim.snapshot.greenLo + sim.snapshot.greenHi) / 2;
      for (let rep = 0; rep < 5; rep++) {
        const before = sim.makes;
        sim.setupHold(true); sim.shoot(mid);
        for (let i = 0; i < 600 && sim.phase !== 'done'; i++) sim.update(1 / 60);
        // eslint-disable-next-line no-console
        console.log(`${tag} mid=${mid.toFixed(3)} scored=${sim.makes > before} msg=${sim.message}`);
      }
    }
    expect(true).toBe(true);
  });
});
