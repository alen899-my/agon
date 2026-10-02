import * as THREE from 'three';
import { TRACK_POINTS } from './Track';

/** Optional, world-anchored race guidance. No physics or navigation HUD. */
export class RaceRoute {
  readonly group = new THREE.Group();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor() {
    this.group.name = 'race-route';
    this.group.visible = false;
    const arrow = new THREE.Shape();
    arrow.moveTo(-1.45, 2.4);
    arrow.lineTo(-0.25, 2.4);
    arrow.lineTo(1.65, 0);
    arrow.lineTo(-0.25, -2.4);
    arrow.lineTo(-1.45, -2.4);
    arrow.lineTo(0.45, 0);
    arrow.closePath();
    const chevron = new THREE.ShapeGeometry(arrow);
    const roadChevron = chevron.clone();
    roadChevron.rotateZ(Math.PI / 2);
    roadChevron.rotateX(-Math.PI / 2);
    const panel = new THREE.PlaneGeometry(17, 6.1);
    this.geometries.push(chevron, roadChevron, panel);
    const yellow = new THREE.MeshBasicMaterial({ color: 0xffdc38, toneMapped: false });
    const pavement = new THREE.MeshBasicMaterial({
      color: 0xffdc38, toneMapped: false, transparent: true, opacity: 0.82,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const backing = new THREE.MeshBasicMaterial({ color: 0x101820, transparent: true, opacity: 0.88 });
    this.materials.push(yellow, pavement, backing);

    const stamps: THREE.Matrix4[] = [];
    const transform = new THREE.Object3D();
    for (let i = 0; i < TRACK_POINTS.length; i++) {
      const start = TRACK_POINTS[i];
      const corner = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
      const next = TRACK_POINTS[(i + 2) % TRACK_POINTS.length];
      const length = Math.hypot(corner.x - start.x, corner.z - start.z);
      const fx = (corner.x - start.x) / length;
      const fz = (corner.z - start.z) / length;
      const nextLength = Math.hypot(next.x - corner.x, next.z - corner.z);
      const ox = (next.x - corner.x) / nextLength;
      const oz = (next.z - corner.z) / nextLength;

      // The boards face approaching cars from just beyond the outside of a turn.
      // They sit clear of the road and never face the camera like a HUD sprite.
      const board = new THREE.Group();
      board.position.set(corner.x + fx * 10.5 + ox * 2, 3.5, corner.z + fz * 10.5 + oz * 2);
      board.rotation.y = Math.atan2(-fx, -fz);
      const background = new THREE.Mesh(panel, backing);
      background.position.z = -0.08;
      board.add(background);
      const turnRight = fx * oz - fz * ox > 0;
      for (let j = 0; j < 4; j++) {
        const sign = new THREE.Mesh(chevron, yellow);
        sign.position.x = (j - 1.5) * 3.8;
        if (!turnRight) sign.rotation.z = Math.PI;
        board.add(sign);
      }
      this.group.add(board);

      // Broad painted arrows reinforce the permitted direction on long straights.
      for (let distance = 20; distance < length - 12; distance += 22) {
        transform.position.set(start.x + fx * distance, 0.16, start.z + fz * distance);
        transform.rotation.set(0, -Math.atan2(fx, -fz), 0);
        transform.updateMatrix();
        stamps.push(transform.matrix.clone());
      }
    }
    const road = new THREE.InstancedMesh(roadChevron, pavement, stamps.length);
    stamps.forEach((matrix, index) => road.setMatrixAt(index, matrix));
    road.instanceMatrix.needsUpdate = true;
    road.computeBoundingSphere();
    this.group.add(road);
  }

  dispose(): void {
    this.group.removeFromParent();
    this.group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.geometries.forEach(geometry => geometry.dispose());
    this.materials.forEach(material => material.dispose());
  }
}
