import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { AssetKit } from '../world/Assets';
import { applyCustomization, clearCustomization, PART_OPTIONS, type PartKey, type VehicleCustomization } from '../world/VehicleCustomization';
import type { VehicleKind } from '../world/Vehicles';

/** Fit the complete customized vehicle inside the available viewport. */
export function frameGarageVehicle(camera: THREE.PerspectiveCamera, vehicle: THREE.Object3D, view: string) {
  vehicle.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vehicle);
  const center = bounds.getCenter(new THREE.Vector3());
  const directions: Record<string, THREE.Vector3> = {
    front: new THREE.Vector3(0.35, 0.3, -1), rear: new THREE.Vector3(-0.4, 0.3, 1),
    side: new THREE.Vector3(1, 0.18, 0), top: new THREE.Vector3(0, 1, 0.001),
    orbit: new THREE.Vector3(1, 0.55, -1.2),
  };
  const direction = (directions[view] ?? directions.orbit).clone().normalize();
  camera.position.copy(center).add(direction); camera.lookAt(center); camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const tanX = tanY * camera.aspect;
  let distance = 1;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const offset = new THREE.Vector3(x, y, z).sub(center);
    distance = Math.max(distance, offset.dot(direction) + Math.max(Math.abs(offset.dot(right)) / tanX, Math.abs(offset.dot(up)) / tanY) * 1.18);
  }
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.far = Math.max(80, distance * 4); camera.updateProjectionMatrix(); camera.lookAt(center);
  return center;
}

export function useGaragePartPreviews(kind: VehicleKind, build: VehicleCustomization, part: PartKey) {
  const [result, setResult] = useState<{ signature: string; images: Record<string, string> }>({ signature: '', images: {} });
  // Changing the selected option does not invalidate all the other thumbnails.
  const signature = JSON.stringify({ kind, ...build, [part]: null, part });
  useEffect(() => {
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); }
    catch { return; }
    renderer.setSize(300, 190); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x24272b);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x697180, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4); light.position.set(4, 7, -5); scene.add(light);
    const fill = new THREE.DirectionalLight(0xcbdfff, 2); fill.position.set(-4, 3, 5); scene.add(fill);
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x30343a, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.005; scene.add(floor);
    const kit = new AssetKit(), vehicle = kit.car(kind); vehicle.group.position.y = 0.08; scene.add(vehicle.group); vehicle.setOccupancy(false);
    const camera = new THREE.PerspectiveCamera(38, 300 / 190, 0.025, 100);
    const view = ['spoiler', 'exhaust', 'rearBumper'].includes(part) ? 'rear' : part === 'roof' ? 'top' : ['tyres', 'rims', 'brakes', 'skirts', 'suspension'].includes(part) ? 'side' : 'orbit';
    let index = 0, frame = 0;
    const images: Record<string, string> = {};
    setResult({ signature, images: {} });
    const renderNext = () => {
      const option = PART_OPTIONS[part][index++];
      if (!option) return;
      applyCustomization(vehicle, kind, { ...build, [part]: option });
      frameGarageVehicle(camera, vehicle.group, view);
      renderer.render(scene, camera);
      images[option] = renderer.domElement.toDataURL('image/webp');
      setResult({ signature, images: { ...images } });
      frame = requestAnimationFrame(renderNext);
    };
    frame = requestAnimationFrame(renderNext);
    return () => { cancelAnimationFrame(frame); clearCustomization(vehicle); kit.dispose(); floorGeometry.dispose(); floorMaterial.dispose(); renderer.dispose(); renderer.forceContextLoss(); };
    // The signature contains every build field except the part being catalogued.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return result.signature === signature ? result.images : {};
}
