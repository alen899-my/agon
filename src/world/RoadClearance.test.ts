import { describe, expect, it } from 'vitest';
import { LAMPS, PARKED_CARS, PROPS, RACE_CROWD, RACE_SHOW_CARS, ROAD_HALF, TRAFFIC_ROUTE, onRoad, type Point } from './Map';
import { Simulation } from './Simulation';

function distToRoute(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < TRAFFIC_ROUTE.length; i++) {
    const p: Point = TRAFFIC_ROUTE[i];
    const q: Point = TRAFFIC_ROUTE[(i + 1) % TRAFFIC_ROUTE.length];
    const dx = q.x - p.x, dz = q.z - p.z;
    const len = Math.hypot(dx, dz);
    const t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (len * len)));
    best = Math.min(best, Math.hypot(x - (p.x + dx * t), z - (p.z + dz * t)));
  }
  return best;
}

describe('road clearance', () => {
  it('no prop or parked-car collider sits on driving asphalt', () => {
    for (const c of [...PROPS, ...PARKED_CARS]) {
      expect(onRoad(c.x, c.z, ROAD_HALF + c.r), `${c.label} at (${c.x},${c.z}) blocks a road`).toBe(false);
    }
  });
  it('every lamp stands off-road with its head clear too', () => {
    expect(LAMPS.length).toBeGreaterThan(8);
    for (const lamp of LAMPS) {
      expect(onRoad(lamp.x, lamp.z, ROAD_HALF + lamp.r)).toBe(false);
      // Lamp head juts ~1.4m toward the road.
      expect(onRoad(lamp.x + (lamp.x < 0 ? 1.4 : -1.4), lamp.z, ROAD_HALF)).toBe(false);
    }
  });
  it('every city parked car spawns off-road (paddock display has its own rule below)', () => {
    const sim = new Simulation();
    expect(sim.parked.length).toBeGreaterThanOrEqual(18);
    for (const p of sim.parked.slice(0, 12)) {
      expect(onRoad(p.x, p.z, ROAD_HALF + 2.5), `${p.kind} at (${p.x},${p.z}) spawns on a road`).toBe(false);
    }
  });
  it('paddock show cars stay clear of the live racing line', () => {
    expect(RACE_SHOW_CARS.length).toBeGreaterThanOrEqual(6);
    for (const s of RACE_SHOW_CARS) {
      expect(distToRoute(s.x, s.z), `${s.kind} display too close to the race line`).toBeGreaterThan(4);
    }
  });
  it('spectator ring stays on the slab, clear of traffic', () => {
    expect(RACE_CROWD.length).toBeGreaterThanOrEqual(12);
    for (const spot of RACE_CROWD) {
      expect(distToRoute(spot.x, spot.z)).toBeGreaterThan(2.2);
    }
  });
});
