import * as THREE from 'three';
import type { Vehicle } from './Assets';
import { VEHICLES, type VehicleKind } from './Vehicles';

/** Distant city traffic shares three draw calls instead of full interiors and wheels. */
export class CityVehicleLOD {
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly paint = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private readonly glass = new THREE.MeshLambertMaterial({ color: 0x34434a });
  private readonly rubber = new THREE.MeshLambertMaterial({ color: 0x16191b });
  private readonly body = new THREE.InstancedMesh(this.geometry, this.paint, 512);
  private readonly cabin = new THREE.InstancedMesh(this.geometry, this.glass, 512);
  private readonly wheels = new THREE.InstancedMesh(this.geometry, this.rubber, 2048);
  private readonly transform = new THREE.Object3D();
  private readonly colors = new WeakMap<Vehicle, THREE.Color>();
  private readonly detailed = new WeakMap<Vehicle, boolean>();
  private count = 0;
  private detailCount = 0;
  private detailLimit = 8;
  constructor(private scene: THREE.Scene) {
    for (const mesh of [this.body, this.cabin, this.wheels]) {
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh);
    }
  }
  begin(detailLimit = 8): void { this.count = 0; this.detailCount = 0; this.detailLimit = detailLimit; }
  hide(vehicle: Vehicle): void {
    vehicle.group.visible = false;
    // Hidden Object3D trees still update world matrices; detach them entirely.
    vehicle.group.removeFromParent();
    this.detailed.set(vehicle, false);
  }
  show(vehicle: Vehicle, kind: VehicleKind, x: number, z: number, yaw: number, distance2: number, near: number): boolean {
    const threshold = near + (this.detailed.get(vehicle) ? 6 : 0);
    if (distance2 < 144 || (distance2 < threshold * threshold && this.detailCount < this.detailLimit)) {
      this.detailCount++;
      if (vehicle.group.parent !== this.scene) this.scene.add(vehicle.group);
      vehicle.group.visible = true; this.detailed.set(vehicle, true); return true;
    }
    this.hide(vehicle);
    if (this.count >= 512) return false;
    let color = this.colors.get(vehicle);
    if (!color) {
      color = new THREE.Color(0x87909a);
      vehicle.group.traverse(object => {
        if (object instanceof THREE.Mesh && object.userData.vehicleRole === 'paint') {
          const material = object.material as THREE.MeshStandardMaterial;
          if (material.color) color!.copy(material.color);
        }
      });
      this.colors.set(vehicle, color);
    }
    const spec = VEHICLES[kind], i = this.count++, height = Math.max(1.15, spec.height + 0.7);
    const stamp = (mesh: THREE.InstancedMesh, index: number, lx: number, y: number, lz: number, w: number, h: number, d: number) => {
      this.transform.position.set(x + Math.cos(yaw) * lx - Math.sin(yaw) * lz, y, z + Math.sin(yaw) * lx + Math.cos(yaw) * lz);
      this.transform.rotation.set(0, -yaw, 0); this.transform.scale.set(w, h, d);
      this.transform.updateMatrix(); mesh.setMatrixAt(index, this.transform.matrix);
    };
    stamp(this.body, i, 0, height * 0.36, 0, spec.width, height * 0.46, spec.length);
    this.body.setColorAt(i, color);
    stamp(this.cabin, i, 0, height * 0.75, 0.1, spec.width * 0.84, height * 0.35, spec.length * 0.53);
    for (let wheel = 0; wheel < 4; wheel++) stamp(this.wheels, i * 4 + wheel,
      (wheel % 2 ? 1 : -1) * spec.width * 0.48, 0.32,
      (wheel < 2 ? -1 : 1) * spec.length * 0.31, 0.23, 0.62, 0.65);
    return false;
  }
  flush(): void {
    this.body.count = this.cabin.count = this.count; this.wheels.count = this.count * 4;
    for (const mesh of [this.body, this.cabin, this.wheels]) {
      mesh.visible = this.count > 0;
      if (this.count) mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.count && this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    for (const mesh of [this.body, this.cabin, this.wheels]) { mesh.removeFromParent(); mesh.dispose(); }
    this.geometry.dispose(); this.paint.dispose(); this.glass.dispose(); this.rubber.dispose();
  }
}
