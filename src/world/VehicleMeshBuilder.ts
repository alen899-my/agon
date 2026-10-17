import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type SurfacePoint = (u: number, v: number) => THREE.Vector3;

/** Author continuous body panels in metres, then batch them by material.
 * Forward is -Z; wheels rotate around X. No renderer or game state is needed.
 * Each builder owns its temporary geometry; finish transfers the merged results.
 */
export class VehicleMeshBuilder {
  private parts = new Map<string, THREE.BufferGeometry[]>();

  add(role: string, geometry: THREE.BufferGeometry, position = new THREE.Vector3(), rotation = new THREE.Euler()): void {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(position,
      new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1)));
    // Every geometry uses the same attribute layout for safe material batching.
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const list = this.parts.get(role) ?? [];
    list.push(g); this.parts.set(role, list); geometry.dispose();
  }

  surface(role: string, point: SurfacePoint, columns = 32, rows = 16, reverse = false): void {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
      const u = i / columns, v = j / rows;
      const p = point(u, v); positions.push(p.x, p.y, p.z); uvs.push(u, 1 - v);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) {
      const a = j * (columns + 1) + i, b = a + 1, c = a + columns + 1, d = c + 1;
      if (reverse) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices); geo.computeVertexNormals(); this.add(role, geo);
  }

  quad(role: string, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, bulge = 0): void {
    this.surface(role, (u, v) => {
      const p = a.clone().lerp(b, u).lerp(d.clone().lerp(c, u), v);
      p.y += Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * bulge;
      return p;
    }, 16, 12);
  }

  box(role: string, x: number, y: number, z: number, w: number, h: number, l: number, rx = 0): void {
    this.add(role, new THREE.BoxGeometry(w, h, l), new THREE.Vector3(x, y, z), new THREE.Euler(rx, 0, 0));
  }

  tube(role: string, points: THREE.Vector3[], radius = 0.018): void {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.add(role, new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), radius, 8, false));
  }

  finish(): Map<string, THREE.BufferGeometry> {
    const result = new Map<string, THREE.BufferGeometry>();
    for (const [role, parts] of this.parts) {
      const geometry = mergeGeometries(parts, false);
      parts.forEach(p => p.dispose());
      if (geometry) { geometry.computeBoundingSphere(); result.set(role, geometry); }
    }
    this.parts.clear(); return result;
  }
}
