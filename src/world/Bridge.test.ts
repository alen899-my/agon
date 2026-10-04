import { describe, expect, it } from 'vitest';
import { Simulation } from './Simulation';
import { BRIDGE, CANAL, PROMENADE, groundHeight, inPromenade, inWater } from './Map';

const tick = (sim: Simulation, count = 60) => { for (let i = 0; i < count; i++) sim.update(1 / 60); };
const running = () => { const sim = new Simulation(); sim.begin(); return sim; };

describe('canal bridge surfaces', () => {
  it('maps deck, ramps, grade and water', () => {
    // Deck queries take the driver's height: from below, the span overhead
    // correctly reads as open air, not road.
    expect(groundHeight(0, -76, BRIDGE.deckY)).toBeCloseTo(BRIDGE.deckY, 5);
    expect(groundHeight(0, -106, BRIDGE.deckY / 2)).toBeCloseTo(BRIDGE.deckY / 2, 5);
    expect(groundHeight(0, -46, BRIDGE.deckY / 2)).toBeCloseTo(BRIDGE.deckY / 2, 5);
    expect(groundHeight(0, -76, 0)).toBe(0);
    expect(groundHeight(0, -30)).toBe(0);
    expect(groundHeight(0, -125)).toBe(0);
    expect(groundHeight(20, -56)).toBeLessThan(0);
    // Deck wins where it flies over the canal.
    expect(groundHeight(0, -60, BRIDGE.deckY)).toBeCloseTo(BRIDGE.deckY, 5);
    // One step off the deck edge is wet.
    expect(groundHeight(BRIDGE.halfW + 1, -56)).toBeLessThan(0);
    expect(inWater(20, -56)).toBe(true);
    expect(inWater(0, -30)).toBe(false);
    expect(CANAL.x1 - CANAL.x0).toBeGreaterThanOrEqual(60);
    // Height-aware: below the deck is promenade air, on it is the span.
    expect(groundHeight(0, -68.5, 0)).toBe(0);
    expect(groundHeight(0, -68.5, BRIDGE.deckY)).toBeCloseTo(BRIDGE.deckY, 5);
    expect(inPromenade(20, -68)).toBe(true);
    expect(inPromenade(20, -60)).toBe(false);
  });

  it('drives up the south ramp, across the deck and down the north ramp', { timeout: 20000 }, () => {
    const sim = running();
    sim.placeAt(0, -125, Math.PI); // facing north up the avenue
    sim.driving = true;
    sim.setInput('forward', true, 'w');
    tick(sim, 300);
    // Should be up on the span by now.
    expect(sim.carY).toBeGreaterThan(3);
    tick(sim, 600);
    // Across and back down to grade on the far side.
    expect(sim.z).toBeGreaterThan(BRIDGE.zNGrade - 2);
    expect(sim.carY).toBeCloseTo(0, 1);
  });

  it('stops cars at the water instead of swimming', () => {
    const sim = running();
    sim.placeAt(20, -80, Math.PI); // facing north toward the canal
    sim.driving = true;
    sim.setInput('forward', true, 'w');
    tick(sim, 150);
    // Pinned at the south bank: reached it (bumper over the edge) but the
    // center never crossed into water or onto the footpath.
    expect(sim.z).toBeLessThan(-68);
    expect(sim.z).toBeGreaterThan(-71.5);
    expect(inWater(sim.x, sim.z)).toBe(false);
    expect(inPromenade(sim.x, sim.z)).toBe(false);
    // Foot off the gas and it stays put.
    sim.clearInput();
    const held = sim.z;
    tick(sim, 120);
    expect(sim.z).toBeCloseTo(held, 1);
    expect(sim.car.speed).toBeLessThan(1);
    expect(sim.carY).toBe(0);
  });

  it('lets feet stroll the promenade under the deck while cars stay out', { timeout: 20000 }, () => {
    const midZ = (PROMENADE.z0 + PROMENADE.z1) / 2;
    const walker = running();
    walker.x = -20; walker.z = midZ; walker.yaw = Math.PI / 2; // east, under the span
    walker.setInput('forward', true, 'w');
    tick(walker, 800);
    expect(walker.x).toBeGreaterThan(20);
    expect(walker.y).toBeCloseTo(0, 1);
    const driver = running();
    driver.placeAt(20, -78, Math.PI); // facing north at the path's edge
    driver.driving = true;
    driver.setInput('forward', true, 'w');
    tick(driver, 150);
    expect(driver.z).toBeLessThan(PROMENADE.z0);
    expect(inPromenade(driver.x, driver.z)).toBe(false);
  });
    const sim = running();
  it('lets a mired car crawl back to the bank instead of soft-locking', () => {
    const sim = running();
    sim.placeAt(20, -56, 0); // teleported into the drink, facing south
    sim.driving = true;
    sim.setInput('forward', true, 'w');
    tick(sim, 300);
    expect(sim.z).toBeLessThan(-70);
    expect(inWater(sim.x, sim.z)).toBe(false);
  });

  it('blocks wading but lets feet use the deck and ramps', { timeout: 20000 }, () => {
    const sim = running();
    sim.x = 20; sim.z = -30; sim.yaw = 0; // facing the canal on foot
    sim.setInput('forward', true, 'w');
    tick(sim, 300);
    expect(sim.z).toBeGreaterThan(-42);
    expect(sim.y).toBe(0);
    // Stroll the deck north and descend the far ramp.
    sim.clearInput();
    sim.x = 0; sim.z = -76; sim.y = BRIDGE.deckY; sim.yaw = Math.PI;
    sim.setInput('forward', true, 'w');
    tick(sim, 600);
    expect(sim.z).toBeGreaterThan(-40);
    expect(sim.y).toBeCloseTo(0, 1);
  });

  it('exits onto the deck surface, never into the drink', () => {
    const sim = running();
    sim.placeAt(0, -76, Math.PI);
    sim.driving = true; sim.carY = BRIDGE.deckY; sim.y = BRIDGE.deckY;
    expect(sim.interact()).toBe(true);
    expect(sim.driving).toBe(false);
    expect(sim.y).toBeCloseTo(BRIDGE.deckY, 5);
    expect(Math.abs(sim.x)).toBeLessThanOrEqual(BRIDGE.halfW + 2.5);
  });
});
