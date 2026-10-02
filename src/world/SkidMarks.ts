import * as THREE from 'three';

/**
 * Drift skid marks: twin dark ribbons laid behind the rear wheels while the
 * car slides, fading out over a minute. Two draw calls total (one ribbon per
 * rear wheel), ring-style point storage, zero per-frame allocation.
 *
 * Matches the stamped arena burnout marks (dark `ink`-style rubber strips).
 */
export const SKID_LIFE = 60; // seconds a mark stays on the road
const SKID_FADE_OUT = 8; // last seconds spent fading away
const SKID_FADE_IN = 0.4; // fresh rubber darkens over this long
const MAX_ALPHA = 0.55; // rubber stain, never solid paint
const MAX_POINTS = 2049; // ~34s of continuous sliding at 60Hz per wheel
const MIN_STEP = 0.12; // ignore sub-steps so slow rolls don't blob
const BREAK_DIST = 3; // teleport/pause jumps collapse to zero-area quads
const WIDTH = 0.3; // ribbon width ≈ tyre width
const LAY_Y = 0.1; // above road paint, just under the tyre contact patch

export interface SkidSample {
  /** Lay fresh rubber this tick. */
  active: boolean;
  /** Car pose. */
  x: number; z: number; yaw: number;
  /** Slip strength in m/s (drives mark darkness). */
  slip: number;
  /** World time (freezes on pause, so marks outlive the pause). */
  time: number;
  /** Rear-axle distance behind car center + half track width. */
  rearOff: number; trackHalf: number;
}

interface Trail {
  /** Flat [x, z, birthTime, strength] per point, live range [start, end). */
  pts: number[];
  start: number;
  geo: THREE.BufferGeometry;
  pos: THREE.BufferAttribute;
  alp: THREE.BufferAttribute;
  mesh: THREE.Mesh;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeTrail(material: THREE.Material): Trail {
  const quads = MAX_POINTS - 1;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 4 * 3), 3);
  const alp = new THREE.BufferAttribute(new Float32Array(MAX_POINTS * 4), 1);
  pos.setUsage(THREE.DynamicDrawUsage); alp.setUsage(THREE.DynamicDrawUsage);
  const index = new Uint32Array(quads * 6);
  for (let i = 0; i < quads; i++) {
    const v = i * 4, q = i * 6;
    index[q] = v; index[q + 1] = v + 1; index[q + 2] = v + 2;
    index[q + 3] = v + 1; index[q + 4] = v + 3; index[q + 5] = v + 2;
  }
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setAttribute('position', pos);
  geo.setAttribute('aAlpha', alp);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { pts: [], start: 0, geo, pos, alp, mesh };
}

export class SkidMarks {
  readonly group = new THREE.Group();
  private readonly trails: [Trail, Trail];
  private readonly material: THREE.ShaderMaterial;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x0b0b0d) } },
      vertexShader: 'attribute float aAlpha; varying float vA; void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor, vA); }',
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.trails = [makeTrail(this.material), makeTrail(this.material)];
    this.group.add(this.trails[0].mesh, this.trails[1].mesh);
  }

  /** Live point count across both ribbons (for tests). */
  livePoints(): number {
    return (this.trails[0].pts.length / 4 - this.trails[0].start) +
      (this.trails[1].pts.length / 4 - this.trails[1].start);
  }

  update(s: SkidSample): void {
    // Rear axle center, then one ribbon per rear wheel.
    const cx = s.x - Math.sin(s.yaw) * s.rearOff;
    const cz = s.z + Math.cos(s.yaw) * s.rearOff;
    const lx = Math.cos(s.yaw) * s.trackHalf, lz = Math.sin(s.yaw) * s.trackHalf;
    const strength = Math.max(0, Math.min(1, 0.35 + s.slip / 8));
    this.pushSample(this.trails[0], s, cx + lx, cz + lz, strength);
    this.pushSample(this.trails[1], s, cx - lx, cz - lz, strength);
    this.rebuild(this.trails[0], s.time);
    this.rebuild(this.trails[1], s.time);
  }

  private pushSample(tr: Trail, s: SkidSample, x: number, z: number, strength: number): void {
    // Expire marks older than a minute.
    const n0 = tr.pts.length / 4;
    while (tr.start < n0 && tr.pts[tr.start * 4 + 2] < s.time - SKID_LIFE) tr.start++;
    if (s.active) {
      const li = (n0 - 1) * 4;
      const fresh = n0 === tr.start ||
        Math.hypot(x - tr.pts[li], z - tr.pts[li + 1]) >= MIN_STEP;
      if (fresh) {
        tr.pts.push(x, z, s.time, strength);
        // Cap storage: keep the newest points, drop the oldest.
        const over = tr.pts.length / 4 - tr.start - MAX_POINTS;
        if (over > 0) tr.start += over;
      }
    }
    // Compact the dead prefix occasionally so the array stays short.
    if (tr.start > 1024) { tr.pts.splice(0, tr.start * 4); tr.start = 0; }
  }

  private rebuild(tr: Trail, now: number): void {
    const p = tr.pos.array as Float32Array, a = tr.alp.array as Float32Array;
    const total = tr.pts.length / 4 - tr.start;
    let quads = 0;
    for (let i = 0; i + 1 < total && quads < MAX_POINTS - 1; i++) {
      const o1 = (tr.start + i) * 4, o2 = o1 + 4;
      const x1 = tr.pts[o1], z1 = tr.pts[o1 + 1], t1 = tr.pts[o1 + 2], k1 = tr.pts[o1 + 3];
      const x2 = tr.pts[o2], z2 = tr.pts[o2 + 1], t2 = tr.pts[o2 + 2], k2 = tr.pts[o2 + 3];
      let nx = 0, nz = 0;
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      const broken = len > BREAK_DIST || len < 1e-4;
      if (!broken) { nx = (-dz / len) * (WIDTH / 2); nz = (dx / len) * (WIDTH / 2); }
      const v = quads * 12;
      p[v] = x1 - nx; p[v + 1] = LAY_Y; p[v + 2] = z1 - nz;
      p[v + 3] = x1 + nx; p[v + 4] = LAY_Y; p[v + 5] = z1 + nz;
      p[v + 6] = broken ? x1 : x2 - nx; p[v + 7] = LAY_Y; p[v + 8] = broken ? z1 : z2 - nz;
      p[v + 9] = broken ? x1 : x2 + nx; p[v + 10] = LAY_Y; p[v + 11] = broken ? z1 : z2 + nz;
      const q = quads * 4;
      a[q] = this.alpha(now, t1, k1); a[q + 1] = a[q];
      a[q + 2] = this.alpha(now, t2, k2); a[q + 3] = a[q + 2];
      quads++;
    }
    tr.pos.needsUpdate = true; tr.alp.needsUpdate = true;
    tr.geo.setDrawRange(0, quads * 6);
  }

  private alpha(now: number, born: number, strength: number): number {
    const age = now - born;
    if (age < 0 || age > SKID_LIFE) return 0;
    return MAX_ALPHA * strength * smooth(0, SKID_FADE_IN, age) * (1 - smooth(SKID_LIFE - SKID_FADE_OUT, SKID_LIFE, age));
  }

  dispose(): void {
    this.group.remove(this.trails[0].mesh, this.trails[1].mesh);
    for (const tr of this.trails) tr.geo.dispose();
    this.material.dispose();
  }
}
