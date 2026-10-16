import * as THREE from 'three';
import { F1_WALLS } from './F1Barriers';
import { f1AccessOpening, f1AccessProgress, onF1Access } from './F1Access';
import {
  F1_DRS_ZONES,
  F1_HALF,
  F1_LENGTH,
  F1_ORIGIN,
  F1_PIT,
  F1_TRACK_WIDTH,
  F1_TURNS,
  f1BaseNoise,
  f1BarrierOffset,
  f1PitLaneAt,
  f1InPitSpan,
  f1HasPitWall,
  f1GridSlots,
  f1KerbZones,
  f1PathAt,
  f1Progress,
  f1StartLine,
  f1TerrainHeightAt,
} from './F1Track';
import {
  makeAsphaltTexture,
  makeBoardTexture,
  makeCheckerTexture,
  makeChevronBoardTexture,
  makeFenceTexture,
  makeGarageTexture,
  makeStandTexture,
} from './F1TrackTexture';

/**
 * F1 island visuals, built like the existing city features:
 * - AssetKit-style instancing (shared geo/materials, InstancedMesh) for
 *   barriers, kerbs, posts, trees, tires and crowd — static, ~zero per-frame cost.
 * - RaceRoute-style canvas textures for asphalt, boards, banners and garages.
 * - Real F1 dressing: kerbs at corners only, TecPro red/white walls, catch
 *   fencing on straights, checker start line, painted grid, braking boards,
 *   tire stacks, floodlights, marshal posts, pit garages and grandstands.
 */
export class F1Route {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly strobes: THREE.Mesh[] = [];
  private readonly strobeMat = new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false });
  private finalLapSign: THREE.Mesh | null = null;
  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  constructor() {
    this.group.name = 'f1-route';
    this.group.visible = false;
    this.materials.push(this.strobeMat);
    this.buildTerrain();
    this.buildSkirts();
    this.buildAsphalt();
    this.buildStartLine();
    this.buildGridPaint();
    this.buildEdgeLines();
    this.buildKerbs();
    this.buildBarriers();
    this.buildFences();
    this.buildTires();
    this.buildBoards();
    this.buildFloodlights();
    this.buildMarshals();
    this.buildGantry();
    this.buildPit();
    this.buildStands();
    this.buildTrees();
  }

  // ── sampling helpers ──────────────────────────────────────────────
  private trackSamples(step = 4): { x: number; z: number; y: number; yaw: number; curvature: number }[] {
    const out: { x: number; z: number; y: number; yaw: number; curvature: number }[] = [];
    const count = Math.floor(F1_LENGTH / step);
    for (let i = 0; i < count; i++) {
      const p = f1PathAt((i / count) * F1_LENGTH, 0);
      out.push(p);
    }
    return out;
  }

  /** Flat ribbon strip between lateral offsets (for road paint / kerb beds). */
  private ribbon(
    halfInner: number,
    halfOuter: number,
    yLift: number,
    withUv = false,
  ): THREE.BufferGeometry {
    const samples = this.trackSamples();
    const n = samples.length;
    const verts = new Float32Array((n + 1) * 2 * 3);
    const uvs = withUv ? new Float32Array((n + 1) * 2 * 2) : null;
    const idx: number[] = [];
    let vDist = 0;
    for (let i = 0; i <= n; i++) {
      const s = samples[i % n];
      if (i > 0) {
        const p = samples[i - 1];
        vDist += Math.hypot(s.x - p.x, s.z - p.z);
      }
      const rx = Math.cos(s.yaw);
      const rz = Math.sin(s.yaw);
      const y = s.y + yLift;
      verts.set([s.x + rx * halfInner, y, s.z + rz * halfInner, s.x + rx * halfOuter, y, s.z + rz * halfOuter], i * 6);
      if (uvs) uvs.set([0, vDist / 14, 1, vDist / 14], i * 4);
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      if (i < n) idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.geometries.push(geo);
    return geo;
  }

  private trackTexture<T extends THREE.Texture>(tex: T): T {
    this.textures.push(tex);
    return tex;
  }

  // ── terrain: rolling hills that match physics ─────────────────────
  private buildTerrain(): void {
    const W = 900;
    const D = 560;
    const SX = 220;
    const SZ = 140;
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + F1_ORIGIN.x;
      const wz = pos.getZ(i) + 20;
      const access = f1AccessProgress(wx, wz);
      const blend = Math.max(0, Math.min(1, (access.distance - 16) / 18));
      const h = (access.height - 0.16) * (1 - blend) + (f1TerrainHeightAt(wx, wz) - 0.08) * blend;
      pos.setY(i, h);
      // Grass variation: two greens + dry patches on the high ground.
      const n = f1BaseNoise(wx * 1.7, wz * 1.7);
      const dry = THREE.MathUtils.clamp(h / 9, 0, 1) * 0.5 + Math.max(0, n) * 0.12;
      c.setHex(0x4d7f42).offsetHSL(0.01 * n, 0.02 * n, dry * 0.09);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(F1_ORIGIN.x, 0, 20);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  /** Embankment skirts: close the gap between the elevated road and the hills. */
  private buildSkirts(): void {
    const samples = this.trackSamples();
    const n = samples.length;
    const positions: number[] = [];
    const colors: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color().setHex(0x476f3c);
    const push = (x: number, y: number, z: number): number => {
      positions.push(x, y, z);
      colors.push(c.r, c.g, c.b);
      return positions.length / 3 - 1;
    };
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const rx = Math.cos(s.yaw);
      const rz = Math.sin(s.yaw);
      for (const side of [-1, 1] as const) {
        const eX = s.x + rx * side * F1_HALF;
        const eZ = s.z + rz * side * F1_HALF;
        const mX = s.x + rx * side * (F1_HALF + 4.5);
        const mZ = s.z + rz * side * (F1_HALF + 4.5);
        const oX = s.x + rx * side * (F1_HALF + 9);
        const oZ = s.z + rz * side * (F1_HALF + 9);
        const tY = f1TerrainHeightAt(oX, oZ) + 0.02;
        const eY = s.y + 0.0;
        const mY = eY + (tY - eY) * 0.55;
        push(eX, eY, eZ);
        push(mX, mY, mZ);
        push(oX, tY, oZ);
      }
    }
    const per = 2; // two sides per station
    for (let i = 0; i < n; i++) {
      for (let s = 0; s < per; s++) {
        const a = (i * per + s) * 3;
        const b = (((i + 1) % n) * per + s) * 3;
        // Each block has 3 verts (edge, mid, outer): two quads.
        idx.push(a, b, a + 1, a + 1, b, b + 1);
        idx.push(a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  // ── road surface ──────────────────────────────────────────────────
  private buildAsphalt(): void {
    const geo = this.ribbon(-F1_HALF, F1_HALF, 0.02, true);
    const tex = this.trackTexture(makeAsphaltTexture());
    tex.repeat.set(1, 1);
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xaaaaaa, roughness: 0.96, metalness: 0 });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private flatPlane(w: number, h: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(w, h);
    geo.rotateX(-Math.PI / 2);
    this.geometries.push(geo);
    return new THREE.Mesh(geo, mat);
  }

  private paintMat(tex: THREE.Texture | null, color = 0xffffff, opacity = 1): THREE.MeshBasicMaterial {
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: tex ? 0xffffff : color,
      toneMapped: false,
      transparent: opacity < 1,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.materials.push(mat);
    return mat;
  }

  private buildStartLine(): void {
    const s = f1StartLine();
    const mat = this.paintMat(this.trackTexture(makeCheckerTexture()));
    const m = this.flatPlane(F1_TRACK_WIDTH, 2.0, mat);
    m.position.set(s.x, s.y + 0.035, s.z);
    m.rotation.y = -s.yaw;
    this.group.add(m);
  }

  private buildGridPaint(): void {
    const mat = this.paintMat(null, 0xf4f4f4);
    const slots = f1GridSlots();
    const longGeo = new THREE.PlaneGeometry(0.12, 4.6);
    longGeo.rotateX(-Math.PI / 2);
    const latGeo = new THREE.PlaneGeometry(2.6, 0.12);
    latGeo.rotateX(-Math.PI / 2);
    this.geometries.push(longGeo, latGeo);
    for (const s of slots) {
      const cos = Math.cos(s.yaw);
      const sin = Math.sin(s.yaw);
      // Right-vector offsets for the box outline (±1.3m lateral, ±2.3m long).
      const parts: { dx: number; dz: number; geo: THREE.BufferGeometry }[] = [
        { dx: -1.3, dz: 0, geo: longGeo },
        { dx: 1.3, dz: 0, geo: longGeo },
        { dx: 0, dz: -2.3, geo: latGeo },
        { dx: 0, dz: 2.3, geo: latGeo },
      ];
      for (const part of parts) {
        const m = new THREE.Mesh(part.geo, mat);
        // part offsets are in car space: lateral along right vector, long along tangent.
        const fx = Math.sin(s.yaw);
        const fz = -Math.cos(s.yaw);
        m.position.set(
          s.x + cos * part.dx + fx * -part.dz,
          s.y + 0.03,
          s.z + sin * part.dx + fz * -part.dz,
        );
        m.rotation.y = -s.yaw;
        this.group.add(m);
      }
    }
  }

  private buildEdgeLines(): void {
    for (const side of [-1, 1] as const) {
      const at = side * (F1_HALF - 0.6);
      const geo = this.ribbon(at - 0.18, at + 0.18, 0.032);
      this.group.add(new THREE.Mesh(geo, this.paintMat(null, 0xf4f4f4)));
    }
  }

  // ── kerbs at corners only ─────────────────────────────────────────
  private buildKerbs(): void {
    const zones = f1KerbZones();
    type Spot = { x: number; y: number; z: number; yaw: number; red: boolean };
    const spots: Spot[] = [];
    zones.forEach((zone, zi) => {
      let k = 0;
      for (let d = zone.start; d <= zone.end; d += 2) {
        // Kerbs on both edges through the corner, alternating red/white.
        for (const side of [-1, 1] as const) {
          if (side > 0 && f1InPitSpan(d)) continue;
          const p = f1PathAt(d, side * (F1_HALF + 0.6));
          if (f1AccessOpening(p.x, p.z)) continue;
          spots.push({ x: p.x, y: p.y + 0.045, z: p.z, yaw: p.yaw, red: (k + (side > 0 ? 1 : 0) + zi) % 2 === 0 });
        }
        k++;
      }
    });
    if (spots.length === 0) return;
    const geo = new THREE.BoxGeometry(1.2, 0.07, 2.0);
    this.geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    this.materials.push(mat);
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, i) => {
      this.dummy.position.set(s.x, s.y, s.z);
      this.dummy.rotation.set(Math.atan(f1Progress(s.x, s.z).grade), -s.yaw, 0, 'YXZ');
      this.dummy.scale.set(1, 1, 1);
      this.dummy.updateMatrix();
      inst.setMatrixAt(i, this.dummy.matrix);
      inst.setColorAt(i, this.tmpColor.setHex(s.red ? 0xd91438 : 0xf4f4f4));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    this.group.add(inst);
  }

  // ── TecPro-style barriers + rails + posts ────────────────────────
  private buildBarriers(): void {
    const geo = new THREE.BoxGeometry(0.6, 1, 1);
    this.geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.materials.push(mat);
    const inst = new THREE.InstancedMesh(geo, mat, F1_WALLS.length);
    F1_WALLS.forEach((wall, i) => {
      this.dummy.position.set(wall.x, wall.y, wall.z);
      this.dummy.rotation.set(wall.pitch, -wall.yaw, 0, 'YXZ');
      this.dummy.scale.set(1, wall.height, wall.length / Math.cos(wall.pitch));
      this.dummy.updateMatrix(); inst.setMatrixAt(i, this.dummy.matrix);
      inst.setColorAt(i, this.tmpColor.setHex(wall.label === 'pit wall' ? 0xd9dcdd : Math.floor(i / 4) % 2 === 0 ? 0xd91438 : 0xf4f4f4));
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere(); this.group.add(inst);
    // Dark cap rail along the top of both walls.
    for (const side of [-1, 1] as const) {
      const samples = this.trackSamples(8);
      const n = samples.length;
      const positions: number[] = [];
      const indices: number[] = [];
      for (let k = 0; k < n; k++) {
        const s = samples[k];
        const offset = f1BarrierOffset(k / n * F1_LENGTH, side);
        const wIn = offset - 0.35;
        const wOut = offset + 0.35;
        const rx = Math.cos(s.yaw);
        const rz = Math.sin(s.yaw);
        positions.push(s.x + rx * wIn, s.y + 0.92, s.z + rz * wIn);
        positions.push(s.x + rx * wOut, s.y + 0.92, s.z + rz * wOut);
      }
      for (let k = 0; k < n; k++) {
        const a = k * 2;
        const b = k * 2 + 1;
        const c = ((k + 1) % n) * 2;
        const d = ((k + 1) % n) * 2 + 1;
        const p = f1PathAt((k + 0.5) / n * F1_LENGTH, f1BarrierOffset((k + 0.5) / n * F1_LENGTH, side));
        if (!f1AccessOpening(p.x, p.z)) indices.push(a, c, b, b, c, d);
      }
      const railGeo = new THREE.BufferGeometry();
      railGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      railGeo.setIndex(indices);
      railGeo.computeVertexNormals();
      this.geometries.push(railGeo);
      const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.5, side: THREE.DoubleSide });
      this.materials.push(railMat);
      this.group.add(new THREE.Mesh(railGeo, railMat));
    }
    // Support posts every 8m behind the walls.
    const postCount = Math.floor(F1_LENGTH / 8) * 2;
    const postGeo = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6);
    this.geometries.push(postGeo);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.7 });
    this.materials.push(postMat);
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    let pi = 0;
    for (let k = 0; k < Math.floor(F1_LENGTH / 8); k++) {
      const d = k * 8;
      for (const side of [-1, 1] as const) {
        const p = f1PathAt(d, f1BarrierOffset(d, side));
        if (f1AccessOpening(p.x, p.z)) continue;
        this.dummy.position.set(p.x, p.y + 1.7, p.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        posts.setMatrixAt(pi++, this.dummy.matrix);
      }
    }
    posts.count = pi;
    posts.instanceMatrix.needsUpdate = true;
    posts.computeBoundingSphere();
    this.group.add(posts);
  }

  /** Catch fencing on the fast (low-curvature) sections only. */
  private buildFences(): void {
    const tex = this.trackTexture(makeFenceTexture());
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.materials.push(mat);
    const geo = new THREE.PlaneGeometry(8, 2.2);
    this.geometries.push(geo);
    for (let d = 0; d < F1_LENGTH; d += 8) {
      const p = f1PathAt(d + 4, 0);
      if (Math.abs(p.curvature) > 0.004) continue;
      for (const side of [-1, 1] as const) {
        const q = f1PathAt(d + 4, f1BarrierOffset(d + 4, side));
        if (f1AccessOpening(q.x, q.z)) continue;
        const m = new THREE.Mesh(geo, mat);
        m.position.set(q.x, q.y + 2.0, q.z);
        // Plane width runs along the track; DoubleSide so both faces render.
        m.rotation.y = -q.yaw + Math.PI / 2;
        this.group.add(m);
      }
    }
  }

  // ── tires, boards, lights, marshals ───────────────────────────────
  private buildTires(): void {
    const spots: { x: number; y: number; z: number }[] = [];
    // Outside of the heavy corners: T2 hairpin, low hairpin, T1.
    const corners = [F1_TURNS[1], F1_TURNS[4], F1_TURNS[0]];
    for (const t of corners) {
      const p = f1Progress(t.x, t.z);
      const c = f1PathAt(p.dist, 0);
      const rx = Math.cos(c.yaw);
      const rz = Math.sin(c.yaw);
      const side = p.curvature !== 0 ? -Math.sign(c.curvature) : 1;
      for (let k = 0; k < 4; k++) {
        const along = (k - 1.5) * 4;
        const q = f1PathAt(p.dist + along, f1BarrierOffset(p.dist + along, side) + side * (1.2 + (k % 2) * 1.5));
        spots.push({ x: q.x, y: f1TerrainHeightAt(q.x, q.z), z: q.z });
      }
    }
    if (spots.length === 0) return;
    const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    this.geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.materials.push(mat);
    // 3-high stacks → 3 instances per spot.
    const inst = new THREE.InstancedMesh(geo, mat, spots.length * 3);
    let i = 0;
    spots.forEach((s, si) => {
      for (let level = 0; level < 3; level++) {
        this.dummy.position.set(s.x, s.y + 0.14 + level * 0.28, s.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        inst.setMatrixAt(i, this.dummy.matrix);
        inst.setColorAt(i, this.tmpColor.setHex(level === 2 && si % 2 === 0 ? 0xf4f4f4 : 0x1c4fd8));
        i++;
      }
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    this.group.add(inst);
  }

  private boardMesh(w: number, h: number, tex: THREE.Texture, doubleSided = true): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(w, h);
    this.geometries.push(geo);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: doubleSided ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false });
    this.materials.push(mat);
    return new THREE.Mesh(geo, mat);
  }

  private postMesh(h = 2.4): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(0.08, 0.08, h, 6);
    this.geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3e45, roughness: 0.7 });
    this.materials.push(mat);
    return new THREE.Mesh(geo, mat);
  }

  private placeBoard(dist: number, lateral: number, w: number, h: number, tex: THREE.Texture, lift = 1.6): void {
    const side = lateral >= 0 ? 1 : -1;
    const p = f1PathAt(dist, side * Math.max(Math.abs(lateral), Math.abs(f1BarrierOffset(dist, side)) + w / 2 + 0.8));
    const board = this.boardMesh(w, h, tex);
    board.position.set(p.x, p.y + lift, p.z);
    // Face oncoming drivers (board normal points back along the tangent).
    board.rotation.y = -p.yaw;
    this.group.add(board);
    const post = this.postMesh(lift);
    post.position.set(p.x, p.y + lift / 2, p.z);
    this.group.add(post);
  }

  private buildBoards(): void {
    // Braking boards before the heavy corners.
    const t2 = f1Progress(F1_TURNS[1].x, F1_TURNS[1].z).dist;
    const t5 = f1Progress(F1_TURNS[4].x, F1_TURNS[4].z).dist;
    const t6 = f1Progress(F1_TURNS[5].x, F1_TURNS[5].z).dist;
    const braking: { dist: number; text: string }[] = [
      { dist: t2 - 100, text: '100' },
      { dist: t2 - 50, text: '50' },
      { dist: t5 - 100, text: '100' },
      { dist: t5 - 50, text: '50' },
      { dist: t6 - 100, text: '100' },
      { dist: t6 - 50, text: '50' },
    ];
    for (const b of braking) {
      this.placeBoard(
        ((b.dist % F1_LENGTH) + F1_LENGTH) % F1_LENGTH,
        F1_HALF + 5,
        3, 1.5,
        this.trackTexture(makeBoardTexture(b.text, '#f4f4f4', '#101114')),
      );
    }
    // Corner number boards at each apex, outside.
    for (const t of F1_TURNS) {
      const p = f1Progress(t.x, t.z);
      const c = f1PathAt(p.dist, 0);
      const side = c.curvature !== 0 ? -Math.sign(c.curvature) : 1;
      this.placeBoard(p.dist, side * (F1_HALF + 5.5), 2.4, 1.5, this.trackTexture(makeBoardTexture(t.name, '#ffb703', '#101114')));
    }
    // DRS detection + activation boards, enlarged and outside the wall.
    for (const zone of F1_DRS_ZONES) {
      this.placeBoard(zone.start - 30, F1_HALF + 5, 6, 2.5, this.trackTexture(makeBoardTexture('DRS', '#0a7d1a', '#ffffff', 'DETECTION')), 2.2);
      this.placeBoard(zone.start - 8, F1_HALF + 5, 6, 2.5, this.trackTexture(makeBoardTexture('DRS', '#0a7d1a', '#ffffff', 'ACTIVATION')), 2.2);
    }
    // Red/white chevron arrow boards on corner outsides (real direction signage).
    for (const t of F1_TURNS) {
      const p = f1Progress(t.x, t.z);
      const c = f1PathAt(p.dist, 0);
      const side = c.curvature !== 0 ? -Math.sign(c.curvature) : 1;
      const dir = c.curvature > 0 ? 'right' : 'left';
      for (const along of [-14, 0, 14]) {
        this.placeBoard(
          p.dist + along, side * (F1_HALF + 4.2), 3.4, 1.25,
          this.trackTexture(makeChevronBoardTexture(dir as 'left' | 'right')), 1.5,
        );
      }
    }
  }

  private buildFloodlights(): void {
    const headMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.7 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff3d0, toneMapped: false });
    this.materials.push(headMat, lampMat);
    for (let k = 0; k < 8; k++) {
      const d = k / 8 * F1_LENGTH;
      const p = f1PathAt(d, f1BarrierOffset(d, -1) - 4);
      const gy = f1TerrainHeightAt(p.x, p.z);
      const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 12, 8);
      this.geometries.push(poleGeo);
      const pole = new THREE.Mesh(poleGeo, headMat);
      pole.position.set(p.x, gy + 6, p.z);
      pole.castShadow = true;
      this.group.add(pole);
      const headGeo = new THREE.BoxGeometry(2.4, 1.0, 0.4);
      this.geometries.push(headGeo);
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(p.x, gy + 12.2, p.z);
      head.rotation.y = -p.yaw + Math.PI;
      this.group.add(head);
      const lampGeo = new THREE.PlaneGeometry(2.2, 0.8);
      this.geometries.push(lampGeo);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(p.x, gy + 12.2, p.z);
      lamp.rotation.y = -p.yaw;
      // Face the track: offset toward the centreline.
      const c = f1PathAt((k / 8) * F1_LENGTH, 0);
      lamp.lookAt(c.x, gy + 4, c.z);
      this.group.add(lamp);
    }
  }

  private buildMarshals(): void {
    const hutMat = new THREE.MeshStandardMaterial({ color: 0xe0621a, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.8 });
    this.materials.push(hutMat, roofMat);
    for (const t of [F1_TURNS[1], F1_TURNS[3], F1_TURNS[4], F1_TURNS[5]]) {
      const p = f1Progress(t.x, t.z);
      const q = f1PathAt(p.dist + 20, f1BarrierOffset(p.dist + 20, 1) + 4);
      const gy = f1TerrainHeightAt(q.x, q.z);
      const hutGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
      this.geometries.push(hutGeo);
      const hut = new THREE.Mesh(hutGeo, hutMat);
      hut.position.set(q.x, gy + 1.1, q.z);
      hut.rotation.y = -q.yaw;
      this.group.add(hut);
      const roofGeo = new THREE.BoxGeometry(2.6, 0.25, 2.6);
      this.geometries.push(roofGeo);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(q.x, gy + 2.35, q.z);
      roof.rotation.y = -q.yaw;
      this.group.add(roof);
    }
  }

  // ── start gantry with light pod ───────────────────────────────────
  private bannerTexture(title: string, sub: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#101319';
    ctx.fillRect(0, 0, 1024, 256);
    const sq = 28;
    for (const row of [0, 256 - sq]) {
      for (let col = 0; col < 1024; col += sq) {
        ctx.fillStyle = (col / sq) % 2 === (row === 0 ? 0 : 1) ? '#ffffff' : '#111111';
        ctx.fillRect(col, row, sq, sq);
      }
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 76px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, 512, 108);
    ctx.font = '600 36px system-ui, sans-serif';
    ctx.fillStyle = '#8be9ff';
    ctx.fillText(sub, 512, 184);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);
    return tex;
  }

  private buildGantry(): void {
    const s = f1StartLine();
    const gate = new THREE.Group();
    gate.position.set(s.x, s.y, s.z);
    gate.rotation.y = -s.yaw;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.6, metalness: 0.4 });
    this.materials.push(postMat);
    const postGeo = new THREE.BoxGeometry(0.6, 6.4, 0.6);
    this.geometries.push(postGeo);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(side * (F1_TRACK_WIDTH / 2 + 1.6), 3.2, 0);
      post.castShadow = true;
      gate.add(post);
    }
    // Truss chords + slats, like the city arena entrance.
    const chordGeo = new THREE.BoxGeometry(F1_TRACK_WIDTH + 4.4, 0.35, 0.35);
    this.geometries.push(chordGeo);
    for (const hy of [6.4, 5.5]) {
      const chord = new THREE.Mesh(chordGeo, postMat);
      chord.position.set(0, hy, 0);
      gate.add(chord);
    }
    const slatGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12);
    this.geometries.push(slatGeo);
    for (let sx = -(F1_TRACK_WIDTH / 2 + 1.6); sx <= F1_TRACK_WIDTH / 2 + 1.6; sx += 2) {
      const slat = new THREE.Mesh(slatGeo, postMat);
      slat.position.set(sx, 5.95, 0);
      gate.add(slat);
    }
    // Banner.
    const bannerGeo = new THREE.PlaneGeometry(F1_TRACK_WIDTH + 2.4, 2.0);
    this.geometries.push(bannerGeo);
    const bannerMat = new THREE.MeshBasicMaterial({ map: this.bannerTexture('F1 CIRCUIT', 'HILLSIDE RING · 8 TURNS'), side: THREE.DoubleSide });
    this.materials.push(bannerMat);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 7.7, 0);
    gate.add(banner);
    // Start light pod: 4 red + 1 green (static dressing; the HUD owns the countdown).
    const podGeo = new THREE.BoxGeometry(1.6, 1.1, 0.4);
    this.geometries.push(podGeo);
    const pod = new THREE.Mesh(podGeo, postMat);
    pod.position.set(0, 5.0, 0);
    gate.add(pod);
    const lampGeo = new THREE.BoxGeometry(0.24, 0.24, 0.1);
    this.geometries.push(lampGeo);
    const redMat = new THREE.MeshBasicMaterial({ color: 0xe11d48, toneMapped: false });
    const greenMat = new THREE.MeshBasicMaterial({ color: 0x35d05a, toneMapped: false });
    const offMat = new THREE.MeshBasicMaterial({ color: 0x2a2d33, toneMapped: false });
    this.materials.push(redMat, greenMat, offMat);
    [-0.6, -0.2, 0.2, 0.6].forEach((ox, i) => {
      const lamp = new THREE.Mesh(lampGeo, i < 2 ? redMat : offMat);
      lamp.position.set(ox, 5.15, 0.22);
      gate.add(lamp);
    });
    const green = new THREE.Mesh(lampGeo, greenMat);
    green.position.set(0, 4.75, 0.22);
    gate.add(green);
    // Final-lap sign + strobes.
    const finalMat = new THREE.MeshBasicMaterial({ map: this.bannerTexture('FINAL LAP', 'PUSH NOW'), side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
    this.materials.push(finalMat);
    const finalGeo = new THREE.PlaneGeometry(7.2, 1.4);
    this.geometries.push(finalGeo);
    const finalMesh = new THREE.Mesh(finalGeo, finalMat);
    finalMesh.position.set(0, 9.3, 0);
    finalMesh.visible = false;
    gate.add(finalMesh);
    this.finalLapSign = finalMesh;
    const strobeGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    this.geometries.push(strobeGeo);
    for (const sx of [-5.2, -2.6, 0, 2.6, 5.2]) {
      const strobe = new THREE.Mesh(strobeGeo, this.strobeMat);
      strobe.position.set(sx, 9.0, 0);
      gate.add(strobe);
      this.strobes.push(strobe);
    }
    this.group.add(gate);
  }

  // ── pit building, boxes, stands, trees ────────────────────────────
  private buildPit(): void {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe2e7, roughness: 0.85 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xd91438, roughness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x2b3542, roughness: 0.2, metalness: 0.5 });
    this.materials.push(wallMat, bandMat, glassMat);
    // Garage row follows the start straight at the pit offset.
    for (let i = 0; i < F1_PIT.boxCount; i++) {
      const d = F1_LENGTH - 80 + i * 20;
      const p = f1PathAt(d, F1_PIT.laneOffset + 9);
      const hallGeo = new THREE.BoxGeometry(9, 6, 8);
      this.geometries.push(hallGeo);
      const hall = new THREE.Mesh(hallGeo, wallMat);
      hall.position.set(p.x, p.y + 3, p.z);
      hall.rotation.y = -p.yaw + Math.PI / 2;
      hall.castShadow = true;
      this.group.add(hall);
      // Garage door with number.
      const doorGeo = new THREE.PlaneGeometry(5.4, 4.2);
      this.geometries.push(doorGeo);
      const doorMat = new THREE.MeshBasicMaterial({ map: this.trackTexture(makeGarageTexture(i + 1)), toneMapped: false });
      this.materials.push(doorMat);
      const door = new THREE.Mesh(doorGeo, doorMat);
      door.position.set(p.x - Math.cos(p.yaw) * 4.55, p.y + 2.4, p.z - Math.sin(p.yaw) * 4.55);
      // Face the lane: +Z toward the track centreline.
      const c = f1PathAt(d, 0);
      door.lookAt(c.x, p.y + 2.4, c.z);
      this.group.add(door);
      // Painted pit box on the lane.
      const boxGeo = new THREE.PlaneGeometry(0.15, 5.4);
      boxGeo.rotateX(-Math.PI / 2);
      this.geometries.push(boxGeo);
      const box = new THREE.Mesh(boxGeo, this.paintMat(null, 0xf4f4f4, 0.9));
      const lane = f1PathAt(d, F1_PIT.laneOffset);
      box.position.set(lane.x, lane.y + 0.03, lane.z);
      box.rotation.y = -lane.yaw;
      this.group.add(box);
    }
    // Red roof band over the whole row.
    const first = f1PathAt(F1_LENGTH - 86, F1_PIT.laneOffset + 9);
    const last = f1PathAt(66, F1_PIT.laneOffset + 9);
    const rowLen = Math.hypot(last.x - first.x, last.z - first.z);
    const roofGeo = new THREE.BoxGeometry(rowLen, 0.5, 10);
    this.geometries.push(roofGeo);
    const roof = new THREE.Mesh(roofGeo, bandMat);
    roof.position.set((first.x + last.x) / 2, first.y + 6.3, (first.z + last.z) / 2);
    roof.rotation.y = -first.yaw + Math.PI / 2;
    this.group.add(roof);
    // Pit-lane asphalt: short ribbon following the lane offset.
    const samples: { x: number; y: number; z: number }[] = [];
    for (let d = F1_PIT.entryDist; d <= F1_LENGTH + F1_PIT.exitDist; d += 2) {
      const p = f1PitLaneAt(d);
      samples.push({ x: p.x, y: p.y + 0.025, z: p.z });
    }
    const positions: number[] = [];
    const indices: number[] = [];
    samples.forEach((s, i) => {
      const p = f1PitLaneAt(F1_PIT.entryDist + i * 2);
      const rx = Math.cos(p.yaw);
      const rz = Math.sin(p.yaw);
      positions.push(s.x - rx * 2.8, s.y, s.z - rz * 2.8, s.x + rx * 2.8, s.y, s.z + rz * 2.8);
      if (i < samples.length - 1) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const laneGeo = new THREE.BufferGeometry();
    laneGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    laneGeo.setIndex(indices);
    laneGeo.computeVertexNormals();
    this.geometries.push(laneGeo);
    const laneMat = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.96 });
    this.materials.push(laneMat);
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.receiveShadow = true;
    this.group.add(lane);
    // Pit speed-limit board at entry.
    this.placeBoard(F1_PIT.entryDist - 15, F1_HALF + 5, 3, 2, this.trackTexture(makeBoardTexture('PIT', '#0a5dc2', '#ffffff', '80 LIMIT')));
  }

  private buildStands(): void {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.7 });
    this.materials.push(concreteMat, roofMat);
    const seatTex = this.trackTexture(makeStandTexture());
    const seatMat = new THREE.MeshStandardMaterial({ map: seatTex, roughness: 0.9 });
    this.materials.push(seatMat);
    const crowdGeo = new THREE.BoxGeometry(0.38, 0.62, 0.3);
    this.geometries.push(crowdGeo);
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.materials.push(crowdMat);
    const palette = [0xd91438, 0xf4f4f4, 0x0a5dc2, 0xffb703, 0x222222, 0x35d05a];
    const crowdSpots: { x: number; y: number; z: number; c: number }[] = [];
    let seed = 4242;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const frs = [0.02, 0.3, 0.55, 0.78];
    for (const f of frs) {
      const s = f1PathAt(f * F1_LENGTH, -34);
      const gy = f1TerrainHeightAt(s.x, s.z);
      const yaw = -s.yaw + Math.PI / 2;
      // 3 stepped tiers.
      for (let tier = 0; tier < 3; tier++) {
        const tierGeo = new THREE.BoxGeometry(26, 1.6, 3.4);
        this.geometries.push(tierGeo);
        const tierMesh = new THREE.Mesh(tierGeo, tier === 1 ? seatMat : concreteMat);
        const back = tier * 3.2;
        tierMesh.position.set(
          s.x + Math.sin(yaw) * 0 + Math.cos(s.yaw) * back,
          gy + 1.2 + tier * 1.7,
          s.z + Math.sin(s.yaw) * back,
        );
        tierMesh.rotation.y = yaw;
        tierMesh.castShadow = true;
        this.group.add(tierMesh);
        // Crowd dots on this tier.
        for (let k = 0; k < 40; k++) {
          const along = (rand() - 0.5) * 24;
          crowdSpots.push({
            x: tierMesh.position.x + Math.cos(yaw) * along,
            y: tierMesh.position.y + 1.1,
            z: tierMesh.position.z - Math.sin(yaw) * along,
            c: palette[Math.floor(rand() * palette.length)],
          });
        }
      }
      // Roof on 4 poles.
      for (const [ox, oz] of [[-11, 0], [11, 0], [-11, 6.4], [11, 6.4]] as const) {
        const poleGeo = new THREE.CylinderGeometry(0.14, 0.14, 7, 6);
        this.geometries.push(poleGeo);
        const pole = new THREE.Mesh(poleGeo, roofMat);
        pole.position.set(
          s.x + Math.cos(yaw) * ox + Math.cos(s.yaw) * oz,
          gy + 3.5,
          s.z - Math.sin(yaw) * ox + Math.sin(s.yaw) * oz,
        );
        this.group.add(pole);
      }
      const roofGeo = new THREE.BoxGeometry(27, 0.4, 11);
      this.geometries.push(roofGeo);
      const roof = new THREE.Mesh(roofGeo, roofMat);
      roof.position.set(s.x + Math.cos(s.yaw) * 3.2, gy + 7.2, s.z + Math.sin(s.yaw) * 3.2);
      roof.rotation.y = yaw;
      roof.castShadow = true;
      this.group.add(roof);
    }
    const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, crowdSpots.length);
    crowdSpots.forEach((spot, i) => {
      this.dummy.position.set(spot.x, spot.y, spot.z);
      this.dummy.rotation.set(0, rand() * 6.28, 0);
      this.dummy.scale.set(1, 0.85 + rand() * 0.35, 1);
      this.dummy.updateMatrix();
      crowd.setMatrixAt(i, this.dummy.matrix);
      crowd.setColorAt(i, this.tmpColor.setHex(spot.c));
    });
    crowd.instanceMatrix.needsUpdate = true;
    if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
    crowd.computeBoundingSphere();
    this.group.add(crowd);
  }

  private buildTrees(): void {
    let seed = 977;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    const spots: { x: number; y: number; z: number; s: number }[] = [];
    let guard = 0;
    while (spots.length < 140 && guard++ < 3000) {
      const x = F1_ORIGIN.x + (rand() - 0.5) * 760;
      const z = 20 + (rand() - 0.5) * 480;
      if (Math.abs(x - F1_ORIGIN.x) > 380 || Math.abs(z - 20) > 240) continue;
      const p = f1Progress(x, z);
      if (p.lateral < 48 || onF1Access(x, z, 24)) continue;
      spots.push({ x, y: f1TerrainHeightAt(x, z), z, s: 0.8 + rand() * 0.9 });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6);
    this.geometries.push(trunkGeo);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3423, roughness: 1 });
    this.materials.push(trunkMat);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leafGeo = new THREE.SphereGeometry(1.7, 8, 6);
    this.geometries.push(leafGeo);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x3d6b34, roughness: 1, flatShading: true });
    this.materials.push(leafMat);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    spots.forEach((s, i) => {
      this.dummy.position.set(s.x, s.y + 1.3 * s.s, s.z);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(s.s, s.s, s.s);
      this.dummy.updateMatrix();
      trunks.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.set(s.x, s.y + (2.6 + 1.2) * s.s, s.z);
      this.dummy.scale.set(s.s, s.s * 1.15, s.s);
      this.dummy.updateMatrix();
      leaves.setMatrixAt(i, this.dummy.matrix);
      leaves.setColorAt(i, this.tmpColor.setHex(0x3d6b34).offsetHSL(0, 0, (i % 5) * 0.015));
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    leaves.computeBoundingSphere();
    this.group.add(trunks, leaves);
  }

  // ── per-frame ─────────────────────────────────────────────────────
  update(_dt: number, simTime: number, isFinalLap: boolean): void {
    if (this.finalLapSign) {
      this.finalLapSign.visible = isFinalLap;
      if (isFinalLap) {
        const pulse = Math.sin(simTime * 8) * 0.1 + 0.95;
        this.finalLapSign.scale.set(pulse, pulse, 1);
        this.finalLapSign.updateMatrix();
      }
    }
    if (this.strobes.length > 0) {
      if (isFinalLap) {
        const flash = Math.sin(simTime * 14) > 0;
        this.strobeMat.color.setHex(flash ? 0xffea00 : 0xffffff);
      } else {
        this.strobeMat.color.setHex(0x333333);
      }
    }
    void _dt;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh) object.geometry?.dispose?.();
    });
    this.textures.forEach((t) => t.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
  }
}

export const F1_WIDTH_LABEL = `${F1_TRACK_WIDTH}m WIDE`;
