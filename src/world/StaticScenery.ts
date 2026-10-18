import * as THREE from 'three';

/** Partition large static instance batches so the renderer can reject off-screen track sections. */
export function partitionScenery(root: THREE.Object3D, cellSize = 64): void {
  const batches: THREE.InstancedMesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.InstancedMesh && object.count > 1 && !object.morphTexture) batches.push(object);
  });
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  for (const source of batches) {
    if (!source.parent) continue;
    const cells = new Map<string, number[]>();
    for (let i = 0; i < source.count; i++) {
      source.getMatrixAt(i, matrix);
      const key = Math.floor(matrix.elements[12] / cellSize) + ':' + Math.floor(matrix.elements[14] / cellSize);
      const bucket = cells.get(key);
      if (bucket) bucket.push(i); else cells.set(key, [i]);
    }
    if (cells.size < 2) continue;
    for (const indices of cells.values()) {
      const chunk = new THREE.InstancedMesh(source.geometry, source.material, indices.length);
      chunk.name = source.name;
      chunk.position.copy(source.position); chunk.quaternion.copy(source.quaternion); chunk.scale.copy(source.scale);
      chunk.castShadow = source.castShadow; chunk.receiveShadow = source.receiveShadow;
      chunk.visible = source.visible; chunk.renderOrder = source.renderOrder;
      chunk.layers.mask = source.layers.mask; chunk.userData = { ...source.userData };
      for (let i = 0; i < indices.length; i++) {
        source.getMatrixAt(indices[i], matrix); chunk.setMatrixAt(i, matrix);
        if (source.instanceColor) { source.getColorAt(indices[i], color); chunk.setColorAt(i, color); }
      }
      chunk.computeBoundingBox(); chunk.computeBoundingSphere();
      source.parent.add(chunk);
    }
    source.removeFromParent();
    // Geometry and materials remain shared; only release the replaced instance buffers.
    source.dispose();
  }
}

/** Static-only visibility gates. Child visibility remains owned by gameplay.
 * Bounds are cached once; no traversal or geometry work in the frame loop.
 * Simulation/collision data is deliberately independent of rendering.
 */
export class SceneryVisibility {
  private readonly entries: { gate: THREE.Group; bounds: THREE.Box3 }[] = [];
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();

  register(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    const meshes: THREE.Mesh[] = [];
    root.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
    for (const mesh of meshes) {
      const parent = mesh.parent;
      if (!parent) continue;
      const bounds = new THREE.Box3().setFromObject(mesh);
      if (bounds.isEmpty()) continue;
      const gate = new THREE.Group();
      gate.name = 'scenery-visibility';
      gate.matrixAutoUpdate = false;
      parent.add(gate);
      gate.add(mesh);
      gate.updateMatrixWorld(true);
      this.entries.push({ gate, bounds });
    }
  }

  update(camera: THREE.PerspectiveCamera, distance: number, shadowReach = 100): void {
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    for (const { gate, bounds } of this.entries) {
      const p = camera.position;
      const dx = Math.max(bounds.min.x - p.x, 0, p.x - bounds.max.x);
      const dy = Math.max(bounds.min.y - p.y, 0, p.y - bounds.max.y);
      const dz = Math.max(bounds.min.z - p.z, 0, p.z - bounds.max.z);
      const rangeSquared = dx * dx + dy * dy + dz * dz;
      // Keep nearby off-screen casters: objects outside the view can cast into it.
      gate.visible = rangeSquared <= distance * distance && (rangeSquared <= shadowReach * shadowReach || this.frustum.intersectsBox(bounds));
    }
  }
}
