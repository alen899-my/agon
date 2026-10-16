import * as THREE from 'three';

/** Partition large static instance batches so the renderer can reject off-screen track sections. */
export function partitionScenery(root: THREE.Object3D, cellSize = 64): void {
  const batches: THREE.InstancedMesh[] = [];
  root.traverse(object => {
    if (object instanceof THREE.InstancedMesh && object.count > 64 && !object.morphTexture) batches.push(object);
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
