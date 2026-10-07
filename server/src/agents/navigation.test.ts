import { expect, it } from 'vitest';
import { walkPath } from './navigation.js';
import { LivingWorld } from './livingWorld.js';

const wall = (x: number, z: number) => x >= 4 && x <= 8 && Math.abs(z) <= 4;
it('routes around a solid without stepping through it', () => {
  const points = walkPath({ x: 0, z: 0 }, { x: 12, z: 0 }, wall);
  expect(points.at(-1)).toEqual({ x: 12, z: 0 });
  expect(points.some(p => Math.abs(p.z) > 4)).toBe(true);
  expect(points.some(p => wall(p.x, p.z))).toBe(false);
});
it('a medic reaches and resolves an incident on the other side of a building', () => {
  const world = new LivingWorld();
  const medic = [...world.blackboard.agents.values()].find(a => a.role === 'medic')!;
  medic.x = 0; medic.z = 0;
  world.incident(12, 0, 0);
  let treated = false;
  for (let t = 100; t < 29_000; t += 100) {
    world.tick(0.1, t, { cops: [], members: [], blocked: wall });
    treated ||= [...world.blackboard.incidents.values()].some(i => i.treated);
  }
  expect(treated).toBe(true);
});
