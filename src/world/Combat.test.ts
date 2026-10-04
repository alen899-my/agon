import { describe, expect, it } from 'vitest';
import { Simulation } from './Simulation';
import { GUNS } from './Guns';

const tick = (sim: Simulation, count = 60) => { for (let i = 0; i < count; i++) sim.update(1 / 60); };
const running = () => { const sim = new Simulation(); sim.begin(); return sim; };
/** On foot, facing yaw, with a clear lane. */
function gunman(x = 12, z = 34, yaw = 0) {
  const sim = running();
  sim.x = x; sim.z = z; sim.yaw = yaw; sim.facing = yaw;
  return sim;
}

describe('arsenal', () => {
  it('ships 10 distinct guns with sane stats', () => {
    expect(GUNS).toHaveLength(10);
    const names = new Set(GUNS.map(g => g.name));
    expect(names.size).toBe(10);
    for (const g of GUNS) {
      expect(g.mag).toBeGreaterThan(0);
      expect(g.interval).toBeGreaterThan(0);
      expect(g.range).toBeGreaterThanOrEqual(30);
      expect(g.reload).toBeGreaterThan(0);
      expect(g.pellets).toBeGreaterThanOrEqual(1);
      expect(g.damage).toBeGreaterThan(0);
      expect(g.zoomFov).toBeGreaterThan(0);
      expect(g.zoomFov).toBeLessThanOrEqual(60);
    }
    expect(GUNS.find(g => g.key === 'sniper')?.scoped).toBe(true);
  });
  it('cycles pistol to LMG then disarms, digits select directly', () => {
    const sim = gunman();
    expect(sim.armed).toBe(false);
    sim.armCycle();
    expect(sim.armed).toBe(true); expect(sim.gunIndex).toBe(0);
    for (let i = 0; i < 9; i++) sim.armCycle();
    expect(sim.gunIndex).toBe(9);
    sim.armCycle();
    expect(sim.armed).toBe(false);
    sim.selectGun(6);
    expect(sim.armed).toBe(true); expect(sim.gunIndex).toBe(6);
  });
});

describe('gunfire', () => {
  it('fires, spends the mag, and raises tracers', () => {
    const sim = gunman();
    sim.selectGun(0);
    sim.setInput('fire', true, 'mouse');
    tick(sim, 2);
    expect(sim.mags[0]).toBe(GUNS[0].mag - 1);
    expect(sim.shotSeq).toBe(1);
    expect(sim.shots.length).toBeGreaterThan(0);
    sim.setInput('fire', false, 'mouse');
  });
  it('dry-fires empty and reloads back to full', () => {
    const sim = gunman();
    sim.selectGun(2); // revolver, 6 rounds
    for (let i = 0; i < 6; i++) {
      sim.setInput('fire', true, `t${i}`);
      tick(sim, 40);
      sim.setInput('fire', false, `t${i}`);
    }
    expect(sim.mags[2]).toBe(0);
    sim.setInput('fire', true, 'dry');
    tick(sim, 5);
    expect(sim.drySeq).toBeGreaterThan(0);
    expect(sim.reloading).toBe(true);
    sim.setInput('fire', false, 'dry');
    tick(sim, 200);
    expect(sim.reloading).toBe(false);
    expect(sim.mags[2]).toBe(GUNS[2].mag);
  });
  it('drops a pedestrian with a sniper round and splashes blood', () => {
    const sim = gunman(12, 34, 0);
    sim.selectGun(8); // sniper: 120 dmg
    const ped = sim.peds[0];
    ped.x = 12; ped.z = 24; ped.hp = 100; ped.dead = false; ped.ragdoll = false;
    const blood = sim.pedBloodSeq;
    sim.setInput('fire', true, 'mouse');
    tick(sim, 3);
    expect(ped.dead).toBe(true);
    expect(sim.pedBloodSeq).toBeGreaterThan(blood);
    expect(sim.hitKill).toBe(true);
    // Corpses stay down.
    tick(sim, 800);
    expect(ped.dead).toBe(true);
    expect(ped.ragdoll).toBe(true);
  });
  it('torches a parked car into burning, boom, and gone', () => {
    const sim = gunman(-14, -30, 0); // parked van at (-14,-38), 8m south
    sim.selectGun(8);
    sim.setInput('fire', true, 'mouse');
    tick(sim, 3);
    const before = sim.parked.length;
    expect(before).toBeGreaterThan(0);
    const van = sim.parked.find(p => p.kind === 'van' && Math.abs(p.x + 14) < 1);
    expect(van?.burning).toBe(true);
    sim.setInput('fire', false, 'mouse');
    tick(sim, 200);
    expect(sim.explodeSeq).toBeGreaterThan(0);
    expect(sim.booms.length).toBeGreaterThan(0);
    expect(sim.parked.length).toBeLessThan(before);
  });
});

describe('player health', () => {
  it('crashing hard wounds the driver as well as the car', () => {
    const sim = gunman();
    sim.interact(); // nearby own car
    sim.transition = 0;
    sim.placeAt(-26, -30, 0); // facing the apartment block to the south
    sim.driving = true;
    sim.setInput('forward', true, 'w');
    tick(sim, 240);
    expect(sim.damage).toBeGreaterThan(0);
    expect(sim.hp).toBeLessThan(100);
  });
  it('dies at zero and respawns GTA-style with guns kept', () => {
    const sim = gunman();
    sim.selectGun(3);
    sim.hurtPlayer(200, 'blast');
    expect(sim.dead).toBe(true);
    expect(sim.hp).toBe(0);
    const seq = sim.deathSeq;
    expect(seq).toBe(1);
    tick(sim, 300);
    expect(sim.dead).toBe(false);
    expect(sim.hp).toBe(100);
    expect(sim.armed).toBe(true); // arsenal kept
    expect(sim.x).toBeCloseTo(12, 0);
    expect(sim.z).toBeCloseTo(34, 0);
  });
  it('regenerates toward half health after six calm seconds', () => {
    const sim = gunman();
    sim.hurtPlayer(80, 'fall', false);
    expect(sim.hp).toBe(20);
    tick(sim, 500);
    expect(sim.hp).toBeGreaterThan(20);
    expect(sim.hp).toBeLessThanOrEqual(50);
  });
});
