import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { AssetKit } from '../world/Assets';
import { VEHICLES, type VehicleKind } from '../world/Vehicles';

// Small bounded image cache; no animation loop or live showroom rendering.
const previews = new Map<VehicleKind, string>();
export function VehiclePreview({ kind, direction }: { kind: VehicleKind; direction: number }) {
  const renderer = useRef<THREE.WebGLRenderer | null>(null);
  const [preview, setPreview] = useState<{ kind: VehicleKind; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => () => {
    renderer.current?.dispose(); renderer.current?.forceContextLoss(); renderer.current = null;
  }, []);
  useEffect(() => {
    setFailed(false);
    const cached = previews.get(kind);
    if (cached) { setPreview({ kind, url: cached }); return; }
    let kit: AssetKit | null = null;
    try {
      const output = renderer.current ?? new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', stencil: false });
      renderer.current = output;
      output.setSize(720, 320, false); output.setPixelRatio(1);
      output.outputColorSpace = THREE.SRGBColorSpace;
      output.toneMapping = THREE.ACESFilmicToneMapping; output.toneMappingExposure = 1.25;
      output.setClearColor(0x000000, 0);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x626870, 2.8));
      const key = new THREE.DirectionalLight(0xfff5e7, 3.5); key.position.set(4, 7, -5); scene.add(key);
      const rim = new THREE.DirectionalLight(0xd7e5ff, 2); rim.position.set(-4, 3, 5); scene.add(rim);
      kit = new AssetKit();
      const car = kit.car(kind); scene.add(car.group);
      const bounds = new THREE.Box3().setFromObject(car.group);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const camera = new THREE.PerspectiveCamera(30, 720 / 320, 0.1, 100);
      const distance = Math.max(size.length() * 1.35, 6);
      camera.position.copy(center).add(new THREE.Vector3(0.9, 0.48, -1.2).normalize().multiplyScalar(distance));
      camera.lookAt(center);
      output.render(scene, camera);
      const url = output.domElement.toDataURL('image/png');
      if (previews.size >= 12) previews.delete(previews.keys().next().value!);
      previews.set(kind, url); setPreview({ kind, url });
      output.renderLists.dispose();
    } catch { setFailed(true); }
    finally { kit?.dispose(); }
  }, [kind]);
  const url = preview?.kind === kind ? preview.url : previews.get(kind);
  return <div className="race-vehicle-image" data-direction={direction < 0 ? 'left' : 'right'}>
    {url ? <img key={kind} src={url} width="720" height="320" alt={VEHICLES[kind].name + ', front three-quarter view'} draggable={false} />
      : <span className="race-preview-placeholder">{failed ? 'Vehicle preview unavailable' : 'Loading vehicle?'}</span>}
  </div>;
}
