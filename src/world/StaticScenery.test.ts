import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { partitionScenery, SceneryVisibility } from './StaticScenery';

describe('static scenery visibility', () => {
  it('partitions even small world-spanning batches and preserves instance colors', () => {
    const scene = new THREE.Scene();
    const source = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
    source.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-100, 0, 0));
    source.setMatrixAt(1, new THREE.Matrix4().makeTranslation(100, 0, 0));
    source.setColorAt(0, new THREE.Color('red'));
    source.setColorAt(1, new THREE.Color('blue'));
    source.position.y = 7;
    scene.add(source);
    partitionScenery(scene, 48);
    expect(scene.children).toHaveLength(2);
    const color = new THREE.Color();
    for (const [i, child] of scene.children.entries()) {
      const chunk = child as THREE.InstancedMesh;
      expect(chunk.count).toBe(1);
      expect(chunk.position.y).toBe(7);
      chunk.getColorAt(0, color);
      expect(color.getHex()).toBe(i === 0 ? 0xff0000 : 0x0000ff);
      expect(chunk.boundingSphere!.radius).toBeLessThan(2);
    }
  });

  it('uses full bounds, camera direction, distance and a shadow margin', () => {
    const scene = new THREE.Scene();
    const add = (x: number, z: number, width = 2) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2, 2), new THREE.MeshBasicMaterial());
      mesh.position.set(x, 0, z); scene.add(mesh); return mesh;
    };
    const front = add(0, -60), behind = add(0, 60), distant = add(0, -400);
    const edge = add(110, -50, 170);
    const visibility = new SceneryVisibility();
    visibility.register(scene);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    visibility.update(camera, 100, 0);
    expect(front.parent!.visible).toBe(true);
    expect(behind.parent!.visible).toBe(false);
    expect(distant.parent!.visible).toBe(false);
    expect(edge.parent!.visible).toBe(true);
    front.visible = false;
    visibility.update(camera, 100, 80);
    expect(behind.parent!.visible).toBe(true);
    expect(front.visible).toBe(false);
    camera.position.z = -350;
    visibility.update(camera, 100, 0);
    expect(distant.parent!.visible).toBe(true);
    expect(front.parent!.visible).toBe(false);
  });

  it('preserves nested world transforms when inserting visibility gates', () => {
    const scene = new THREE.Scene(), parent = new THREE.Group();
    parent.position.set(50, 10, -70); parent.rotation.y = 0.4;
    scene.add(parent);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.position.set(3, 2, 1); parent.add(mesh);
    const before = mesh.getWorldPosition(new THREE.Vector3());
    new SceneryVisibility().register(scene);
    expect(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(before)).toBeLessThan(1e-8);
  });
});
