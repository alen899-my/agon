import * as THREE from 'three';
import { TRACK_POINTS, checkpoints } from './Track';
import { ROAD_HALF, onRoad } from './Map';

/** Y rotation that aims the -Z-forward chevron along the (fx, fz) travel direction.
 *  Matches vehicle convention (group.rotation.y = -yaw, forward = (sin yaw, -cos yaw)). */
export function arrowYaw(fx: number, fz: number): number {
  return -Math.atan2(fx, -fz);
}

/** Directional guidance spots approaching corners and along long straights.
 *  Only on drivable asphalt, never blocking cross-intersections. */
export function arrowSpots(): { x: number; z: number; yaw: number }[] {
  const spots: { x: number; z: number; yaw: number }[] = [];
  for (let i = 0; i < TRACK_POINTS.length; i++) {
    const start = TRACK_POINTS[i];
    const corner = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
    const length = Math.hypot(corner.x - start.x, corner.z - start.z);
    if (length < 30) continue;
    const fx = (corner.x - start.x) / length;
    const fz = (corner.z - start.z) / length;

    // Place guidance arrows well into the leg and approaching the turn
    const step = 28;
    for (let distance = 24; distance <= length - 18; distance += step) {
      const x = start.x + fx * distance;
      const z = start.z + fz * distance;
      if (!onRoad(x, z, ROAD_HALF)) continue;
      // Leave cross-intersections clear (within 10m of x=80, z=-6 etc)
      if (Math.hypot(x - 80, z - (-6)) < 12) continue;
      spots.push({ x, z, yaw: arrowYaw(fx, fz) });
    }
  }
  return spots;
}

/**
 * World-anchored professional race track guidance:
 * - Sleek, glowing neon directional road chevrons (cyan).
 * - Red & white apex rumble-strip kerbs on all corners.
 * - Glowing neon sector checkpoint pylons & laser gate arches.
 * - Double-sided 3D checkered finishing banner with dynamic final-lap lighting.
 */
export class RaceRoute {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly strobes: THREE.Mesh[] = [];
  private readonly strobeMat = new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false });
  private finalLapSign: THREE.Mesh | null = null;
  private bannerMesh: THREE.Mesh | null = null;
  private cyanRoadMat: THREE.MeshBasicMaterial | null = null;
  private readonly animatedBarricades: { texture: THREE.Texture; speed: number }[] = [];

  constructor() {
    this.group.name = 'race-route';
    this.group.visible = false;
    this.materials.push(this.strobeMat);

    // ── 1. Aerodynamic Directional Road Chevron ──────────────────────
    const arrow = new THREE.Shape();
    arrow.moveTo(-1.2, 1.8);
    arrow.lineTo(-0.2, 1.8);
    arrow.lineTo(1.4, 0);
    arrow.lineTo(-0.2, -1.8);
    arrow.lineTo(-1.2, -1.8);
    arrow.lineTo(0.35, 0);
    arrow.closePath();

    const chevronGeo = new THREE.ShapeGeometry(arrow);
    chevronGeo.rotateZ(Math.PI / 2);
    chevronGeo.rotateX(-Math.PI / 2);
    this.geometries.push(chevronGeo);

    // Modern glowing cyan road paint with polygon offset so it never z-fights
    const cyanMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      toneMapped: false,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.cyanRoadMat = cyanMat;
    this.materials.push(cyanMat);

    const spots = arrowSpots();
    if (spots.length > 0) {
      const roadArrows = new THREE.InstancedMesh(chevronGeo, cyanMat, spots.length);
      const dummy = new THREE.Object3D();
      spots.forEach((spot, idx) => {
        dummy.position.set(spot.x, 0.08, spot.z);
        dummy.rotation.set(0, spot.yaw, 0);
        dummy.scale.set(0.9, 1, 0.9);
        dummy.updateMatrix();
        roadArrows.setMatrixAt(idx, dummy.matrix);
      });
      roadArrows.instanceMatrix.needsUpdate = true;
      roadArrows.computeBoundingSphere();
      this.group.add(roadArrows);
    }

    // ── 2. Red & White Apex Rumble Kerbs on Every Corner ─────────────
    this.buildApexKerbs();

    // ── 3. Start/Finish Gantry & Flush Road Timing Sensors (NO blue doors!) ──
    this.buildCheckpointGates();

    // ── 4. Fast & Furious Animated Virtual Roadblock Barricades ───────
    this.buildFastAndFuriousBarricades();
  }

  /** Builds alternating red & white racing rumble kerbs on corner apexes. */
  private buildApexKerbs(): void {
    const kerbGeo = new THREE.BoxGeometry(1.6, 0.07, 0.9);
    this.geometries.push(kerbGeo);

    const redMat = new THREE.MeshBasicMaterial({ color: 0xd91438, toneMapped: false });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf4f4f4, toneMapped: false });
    this.materials.push(redMat, whiteMat);

    const corners: { x: number; z: number; inDx: number; inDz: number; outDx: number; outDz: number }[] = [
      { x: 76, z: 76, inDx: 1, inDz: 0, outDx: 0, outDz: -1 },     // Turn 1 (East -> South)
      { x: 76, z: -76, inDx: 0, inDz: -1, outDx: 1, outDz: 0 },    // Turn 2 (South -> East)
      { x: 136, z: -76, inDx: 1, inDz: 0, outDx: 0, outDz: -1 },   // Turn 3 (East -> South)
      { x: 136, z: -136, inDx: 0, inDz: -1, outDx: -1, outDz: 0 }, // Turn 4 (South -> West)
      { x: -136, z: -136, inDx: -1, inDz: 0, outDx: 0, outDz: 1 }, // Turn 5 (West -> North)
      { x: -136, z: 76, inDx: 0, inDz: 1, outDx: 1, outDz: 0 },    // Turn 6 (North -> East)
    ];

    const kerbGroup = new THREE.Group();
    for (const c of corners) {
      const turnRight = c.inDx * c.outDz - c.inDz * c.outDx > 0;

      for (let s = -3; s <= 3; s++) {
        const t = (s + 3) / 6;
        const dirX = c.inDx * (1 - t) + c.outDx * t;
        const dirZ = c.inDz * (1 - t) + c.outDz * t;
        const len = Math.hypot(dirX, dirZ) || 1;
        const nx = turnRight ? (dirZ / len) : -(dirZ / len);
        const nz = turnRight ? -(dirX / len) : (dirX / len);

        const posX = c.x + (c.inDx * (s * 1.5)) + nx * 6.2;
        const posZ = c.z + (c.inDz * (s * 1.5)) + nz * 6.2;
        const yaw = Math.atan2(dirX, -dirZ);

        const mesh = new THREE.Mesh(kerbGeo, Math.abs(s) % 2 === 0 ? redMat : whiteMat);
        mesh.position.set(posX, 0.05, posZ);
        mesh.rotation.y = -yaw;
        kerbGroup.add(mesh);
      }
    }
    this.group.add(kerbGroup);
  }

  /** Helper to generate dynamic neon chevron textures for Fast & Furious barricades. */
  private createBarricadeTexture(direction: 'right' | 'left'): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    // Dark cybernetic semi-transparent background
    ctx.fillStyle = '#060812';
    ctx.fillRect(0, 0, 512, 128);

    // Hazard stripes top & bottom
    const hz = 14;
    for (let x = 0; x < 512; x += 24) {
      ctx.fillStyle = (x / 24) % 2 === 0 ? '#ffb703' : '#1a1a24';
      ctx.fillRect(x, 0, 24, hz);
      ctx.fillRect(x, 128 - hz, 24, hz);
    }

    // Bold glowing chevrons
    ctx.fillStyle = '#ffb703';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#fb8500';
    ctx.shadowBlur = 14;

    const count = 4;
    const step = 512 / count;
    for (let i = 0; i < count; i++) {
      const cx = i * step + step / 2;
      ctx.beginPath();
      if (direction === 'right') {
        ctx.moveTo(cx - 28, 22);
        ctx.lineTo(cx + 8, 64);
        ctx.lineTo(cx - 28, 106);
        ctx.lineTo(cx - 8, 106);
        ctx.lineTo(cx + 28, 64);
        ctx.lineTo(cx - 8, 22);
      } else {
        ctx.moveTo(cx + 28, 22);
        ctx.lineTo(cx - 8, 64);
        ctx.lineTo(cx + 28, 106);
        ctx.lineTo(cx + 8, 106);
        ctx.lineTo(cx - 28, 64);
        ctx.lineTo(cx + 8, 22);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Fast & Furious styled text
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 10;
    ctx.fillText(direction === 'right' ? '⚡ DRIFT >>>' : '<<< DRIFT ⚡', 256, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.repeat.set(2, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textures.push(tex);
    return tex;
  }

  /**
   * Fast & Furious Virtual Arrow Barricade Walls:
   * Replaces obstructive door frames with authentic street-racing roadblock barriers
   * that seal off non-track streets and stream animated glowing chevrons into each turn.
   */
  private buildFastAndFuriousBarricades(): void {
    const rightTex = this.createBarricadeTexture('right');
    const leftTex = this.createBarricadeTexture('left');

    this.animatedBarricades.push(
      { texture: rightTex, speed: -1.4 },
      { texture: leftTex, speed: 1.4 }
    );

    const barGeo = new THREE.PlaneGeometry(16.0, 3.8);
    this.geometries.push(barGeo);

    const rightMat = new THREE.MeshBasicMaterial({
      map: rightTex,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const leftMat = new THREE.MeshBasicMaterial({
      map: leftTex,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.materials.push(rightMat, leftMat);

    // 6 strategic roadblock barricade placements at closed-off intersections
    const barricades: { x: number; z: number; yaw: number; mat: THREE.Material }[] = [
      { x: 92, z: 76, yaw: -Math.PI / 2, mat: rightMat },    // Turn 1 (East blocked -> drift South)
      { x: 76, z: -92, yaw: 0, mat: leftMat },              // Turn 2 (South blocked -> drift East)
      { x: 152, z: -76, yaw: -Math.PI / 2, mat: rightMat },  // Turn 3 (East blocked -> drift South)
      { x: 136, z: -152, yaw: 0, mat: rightMat },           // Turn 4 (South blocked -> drift West)
      { x: -152, z: -136, yaw: Math.PI / 2, mat: rightMat }, // Turn 5 (West blocked -> drift North)
      { x: -136, z: 92, yaw: Math.PI, mat: rightMat },       // Turn 6 (North blocked -> drift East)
    ];

    const baseGeo = new THREE.BoxGeometry(16.2, 0.4, 0.6);
    this.geometries.push(baseGeo);
    const baseMat = new THREE.MeshBasicMaterial({ color: 0x111318 });
    this.materials.push(baseMat);

    barricades.forEach(b => {
      const mesh = new THREE.Mesh(barGeo, b.mat);
      mesh.position.set(b.x, 1.9, b.z);
      mesh.rotation.y = b.yaw;
      this.group.add(mesh);

      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(b.x, 0.2, b.z);
      base.rotation.y = b.yaw;
      this.group.add(base);
    });
  }

  /**
   * Builds the Start/Finish gantry at Checkpoint 0, and flush road sensors
   * at intermediate checkpoints (completely eliminates "blue doors").
   */
  private buildCheckpointGates(): void {
    const postGeo = new THREE.BoxGeometry(0.4, 3.6, 0.4);
    const lightStripGeo = new THREE.BoxGeometry(0.14, 2.8, 0.14);
    const beamGeo = new THREE.BoxGeometry(15.0, 0.15, 0.15);
    this.geometries.push(postGeo, lightStripGeo, beamGeo);

    const darkPostMat = new THREE.MeshBasicMaterial({ color: 0x181c24 });
    const cyanLightMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff, toneMapped: false });
    const goldLightMat = new THREE.MeshBasicMaterial({ color: 0xffd000, toneMapped: false });
    this.materials.push(darkPostMat, cyanLightMat, goldLightMat);

    const cps = checkpoints();
    cps.forEach((cp, idx) => {
      const isStart = idx === 0;

      const gate = new THREE.Group();
      gate.position.set(cp.x, 0, cp.z);
      gate.rotation.y = -cp.yaw;

      // ── START/FINISH LINE GANTRY ONLY (NO blue doors at intermediate checkpoints!) ──
      if (isStart) {
        // Left & right industrial gantry posts on sidewalk edge
        for (const side of [-7.2, 7.2]) {
          const post = new THREE.Mesh(postGeo, darkPostMat);
          post.position.set(side, 1.8, 0);
          gate.add(post);

          const strip = new THREE.Mesh(lightStripGeo, goldLightMat);
          strip.position.set(side, 1.8, 0.12);
          gate.add(strip);
        }

        // Overhead truss beam across the road
        const beam = new THREE.Mesh(beamGeo, darkPostMat);
        beam.position.set(0, 3.4, 0);
        gate.add(beam);

        // 3D double-sided Checkered Finish Line Banner
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 256;
        const ctx = canvas.getContext('2d')!;

        ctx.fillStyle = '#0a0d14';
        ctx.fillRect(0, 0, 1024, 256);

        // Checkered flag top & bottom borders
        const sq = 28;
        for (const row of [0, 256 - sq]) {
          for (let col = 0; col < 1024; col += sq) {
            ctx.fillStyle = (col / sq) % 2 === (row === 0 ? 0 : 1) ? '#ffffff' : '#111111';
            ctx.fillRect(col, row, sq, sq);
          }
        }

        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 6;
        ctx.strokeRect(6, sq + 4, 1012, 256 - sq * 2 - 8);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 76px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 22;
        ctx.fillText('🏁  FINISH LINE  🏁', 512, 128);

        const bannerTex = new THREE.CanvasTexture(canvas);
        bannerTex.colorSpace = THREE.SRGBColorSpace;
        this.textures.push(bannerTex);

        const bannerMat = new THREE.MeshBasicMaterial({
          map: bannerTex,
          side: THREE.DoubleSide,
        });
        this.materials.push(bannerMat);

        const bannerGeo = new THREE.PlaneGeometry(14.0, 2.2);
        this.geometries.push(bannerGeo);

        const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
        bannerMesh.position.set(0, 4.4, 0);
        gate.add(bannerMesh);
        this.bannerMesh = bannerMesh;

        // Glowing FINAL LAP neon sign that illuminates on the final lap
        const finalCanvas = document.createElement('canvas');
        finalCanvas.width = 512;
        finalCanvas.height = 128;
        const fctx = finalCanvas.getContext('2d')!;
        fctx.fillStyle = '#d91438';
        if (typeof fctx.roundRect === 'function') {
          fctx.beginPath();
          fctx.roundRect(8, 8, 496, 112, 16);
          fctx.fill();
        } else {
          fctx.fillRect(8, 8, 496, 112);
        }
        fctx.strokeStyle = '#ffd700';
        fctx.lineWidth = 6;
        if (typeof fctx.roundRect === 'function') {
          fctx.beginPath();
          fctx.roundRect(12, 12, 488, 104, 12);
          fctx.stroke();
        } else {
          fctx.strokeRect(12, 12, 488, 104);
        }
        fctx.textAlign = 'center';
        fctx.textBaseline = 'middle';
        fctx.font = '900 50px system-ui, sans-serif';
        fctx.fillStyle = '#ffffff';
        fctx.shadowColor = '#ffd700';
        fctx.shadowBlur = 18;
        fctx.fillText('⚡ FINAL LAP ⚡', 256, 64);

        const finalTex = new THREE.CanvasTexture(finalCanvas);
        finalTex.colorSpace = THREE.SRGBColorSpace;
        this.textures.push(finalTex);

        const finalMat = new THREE.MeshBasicMaterial({
          map: finalTex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.96,
        });
        this.materials.push(finalMat);

        const finalGeo = new THREE.PlaneGeometry(7.2, 1.4);
        this.geometries.push(finalGeo);

        const finalMesh = new THREE.Mesh(finalGeo, finalMat);
        finalMesh.position.set(0, 5.85, 0);
        finalMesh.visible = false;
        gate.add(finalMesh);
        this.finalLapSign = finalMesh;

        // Overhead stadium strobe lights atop gantry
        const strobeGeo = new THREE.BoxGeometry(0.35, 0.35, 0.35);
        this.geometries.push(strobeGeo);
        for (const sx of [-5.2, -2.6, 0, 2.6, 5.2]) {
          const strobe = new THREE.Mesh(strobeGeo, this.strobeMat);
          strobe.position.set(sx, 5.65, 0);
          gate.add(strobe);
          this.strobes.push(strobe);
        }
      }

      // Flush timing sector line stamped directly on the asphalt (no vertical doors!)
      const lineGeo = new THREE.PlaneGeometry(14.4, 0.28);
      lineGeo.rotateX(-Math.PI / 2);
      this.geometries.push(lineGeo);

      const splitLine = new THREE.Mesh(lineGeo, isStart ? goldLightMat : cyanLightMat);
      splitLine.position.set(0, 0.03, 0);
      gate.add(splitLine);

      // Low-profile curb beacons (height 0.12m) on sidewalk
      if (!isStart) {
        const beaconGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.14, 10);
        this.geometries.push(beaconGeo);
        for (const side of [-7.2, 7.2]) {
          const beacon = new THREE.Mesh(beaconGeo, cyanLightMat);
          beacon.position.set(side, 0.07, 0);
          gate.add(beacon);
        }
      }

      this.group.add(gate);
    });
  }

  /** Dynamic update each frame for Fast & Furious barricade scrolling and final lap strobe animation. */
  update(dt: number, simTime: number, isFinalLap: boolean): void {
    // Animate Fast & Furious roadblock barricades: streaming neon chevrons
    for (const item of this.animatedBarricades) {
      item.texture.offset.x += item.speed * dt;
    }

    // Pulse road arrows with dynamic neon glow
    if (this.cyanRoadMat) {
      this.cyanRoadMat.opacity = 0.75 + Math.sin(simTime * 4.5) * 0.18;
    }

    // Final lap gantry lighting
    if (this.finalLapSign) {
      this.finalLapSign.visible = isFinalLap;
      if (isFinalLap) {
        const pulse = Math.sin(simTime * 8) * 0.1 + 0.95;
        this.finalLapSign.scale.set(pulse, pulse, 1);
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
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh) object.geometry?.dispose();
    });
    this.textures.forEach(t => t.dispose());
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
  }
}
