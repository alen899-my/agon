import { describe, expect, it } from 'vitest';
import { VEHICLES, type VehicleKind } from './Vehicles';
import { wheelDims } from './VehicleFactory';

describe('wheel dimensions', () => {
  it('gives every kind a tyre wider than its rim disc, tucked inside the rubber', () => {
    for (const kind of Object.keys(VEHICLES) as VehicleKind[]) {
      const { WR, tireW, rimR } = wheelDims(kind, VEHICLES[kind]);
      expect(tireW).toBeGreaterThanOrEqual(0.26);
      expect(tireW - 0.04).toBeGreaterThan(0); // rim disc stays inside the sidewalls
      expect(rimR).toBeLessThan(WR);
    }
  });
  it('scales rubber with wheel radius (no bicycle tyres on rigs)', () => {
    const bus = wheelDims('bus', VEHICLES.bus);
    const semi = wheelDims('semi', VEHICLES.semi);
    const compact = wheelDims('compact', VEHICLES.compact);
    expect(bus.tireW).toBeGreaterThan(compact.tireW);
    expect(bus.tireW).toBeGreaterThan(0.3);
    expect(semi.tireW).toBeGreaterThan(0.3);
  });
  it('keeps the rim a small center, never a second big circle in the middle', () => {
    for (const kind of Object.keys(VEHICLES) as VehicleKind[]) {
      const { WR, rimR } = wheelDims(kind, VEHICLES[kind]);
      // Rim face stays at most half the wheel: one black tyre ring + small hub.
      expect(rimR / WR).toBeLessThanOrEqual(0.5);
    }
  });
});
