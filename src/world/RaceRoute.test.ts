import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arrowSpots, arrowYaw } from './RaceRoute';
import { TRACK_POINTS } from './Track';
import { ROAD_HALF, onRoad } from './Map';

/** Rebuilds the road chevron exactly like RaceRoute and returns where its tip
 *  lands in world space for a leg heading (fx, fz) through the origin. */
function tipForLeg(fx: number, fz: number): { x: number; z: number } {
  const shape = new THREE.Shape();
  shape.moveTo(-1.45, 2.4);
  shape.lineTo(-0.25, 2.4);
  shape.lineTo(1.65, 0);
  shape.lineTo(-0.25, -2.4);
  shape.lineTo(-1.45, -2.4);
  shape.lineTo(0.45, 0);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateZ(Math.PI / 2);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Matrix4().makeRotationY(arrowYaw(fx, fz));
  // Tip vertex is the +X shape corner (1.65, 0) -> (0, 0, -1.65) after baking.
  const tip = new THREE.Vector3(0, 0, -1.65).applyMatrix4(m);
  geo.dispose();
  return { x: tip.x, z: tip.z };
}

describe('race direction arrows', () => {
  it('points the chevron tip along travel for every cardinal leg', () => {
    expect(tipForLeg(1, 0).x).toBeGreaterThan(1); // east
    expect(tipForLeg(-1, 0).x).toBeLessThan(-1); // west
    expect(tipForLeg(0, 1).z).toBeGreaterThan(1); // south (+z)
    expect(tipForLeg(0, -1).z).toBeLessThan(-1); // north (-z)
  });
  it('matches the vehicle yaw convention on every track leg', () => {
    for (let i = 0; i < TRACK_POINTS.length; i++) {
      const a = TRACK_POINTS[i], b = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const fx = (b.x - a.x) / len, fz = (b.z - a.z) / len;
      // Vehicle forward for yaw is (sin yaw, -cos yaw); arrow tip must equal it.
      const yaw = Math.atan2(fx, -fz);
      expect(arrowYaw(fx, fz)).toBeCloseTo(-yaw, 10);
      const tip = tipForLeg(fx, fz);
      expect(tip.x).toBeCloseTo(Math.sin(yaw) * 1.65, 5);
      expect(tip.z).toBeCloseTo(-Math.cos(yaw) * 1.65, 5);
    }
  });
  it('only stamps arrows where asphalt exists', () => {
    const spots = arrowSpots();
    expect(spots.length).toBeGreaterThan(10);
    for (const s of spots) expect(onRoad(s.x, s.z, ROAD_HALF)).toBe(true);
  });
  it('leaves the short chicane jog unmarked', () => {
    const spots = arrowSpots();
    const near = (x: number, z: number, r: number) => spots.some((s) => Math.hypot(s.x - x, s.z - z) < r);
    expect(near(80, -6, 10)).toBe(false);
  });
  it('has no dead directions: nearby arrows always agree', () => {
    const spots = arrowSpots();
    const angDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      if (Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) < 8) {
        expect(angDiff(spots[i].yaw, spots[j].yaw)).toBeLessThan(Math.PI / 4);
      }
    }
  });
});
