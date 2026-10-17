import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetKit } from '../world/Assets';
import type { VehicleParts } from '../world/VehicleFactory';
import { VEHICLES, type VehicleKind } from '../world/Vehicles';
import { applyCustomization, clearCustomization, type VehicleCustomization } from '../world/VehicleCustomization';
import { createGarageBuilding } from '../world/GarageBuilding';

export function GaragePreview({ kind, build, view }: { kind: VehicleKind; build: VehicleCustomization; view: string }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ vehicle: VehicleParts; controls: OrbitControls; camera: THREE.PerspectiveCamera } | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(build); latest.current = build;
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setError('3D preview could not start. Close another graphics tab and reopen the garage.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D garage vehicle preview. Drag to orbit, scroll to zoom.');
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x10171c); scene.fog = new THREE.Fog(0x10171c, 22, 45);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
    const length = VEHICLES[kind].length;
    camera.position.set(length * 1.35, length * 0.7, -length * 1.5);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 0.8, 0); controls.enableDamping = true;
    controls.minDistance = 3; controls.maxDistance = 19; controls.maxPolarAngle = Math.PI * 0.48; controls.enablePan = false;
    scene.add(new THREE.HemisphereLight(0xe5f4ff, 0x334440, 2.3));
    const key = new THREE.DirectionalLight(0xffead2, 4); key.position.set(3, 7, -4); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 }); key.shadow.bias = -0.001; scene.add(key);
    const rim = new THREE.DirectionalLight(0x78f7df, 2.8); rim.position.set(-6, 4, 5); scene.add(rim);
    const shop = createGarageBuilding(true); shop.group.rotation.y = Math.PI; scene.add(shop.group);
    const kit = new AssetKit(), vehicle = kit.car(kind); scene.add(vehicle.group);
    applyCustomization(vehicle, kind, latest.current);
    live.current = { vehicle, controls, camera };
    const resize = () => { const { width, height } = element.getBoundingClientRect(); renderer.setSize(Math.max(1, width), Math.max(1, height)); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    let frame = 0;
    const draw = () => { controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(draw); }; draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); clearCustomization(vehicle); shop.dispose(); kit.dispose(); key.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); live.current = null; };
  }, [kind]);
  useEffect(() => { if (live.current) applyCustomization(live.current.vehicle, kind, build); }, [kind, build]);
  useEffect(() => {
    const l = live.current; if (!l) return;
    const d = VEHICLES[kind].length;
    const positions: Record<string, [number, number, number]> = { front: [d * 0.45, d * 0.4, -d * 1.7], rear: [-d * 0.65, d * 0.45, d * 1.6], side: [d * 1.8, d * 0.35, 0], top: [0.1, d * 1.9, 0.1], orbit: [d * 1.35, d * 0.7, -d * 1.5] };
    l.camera.position.set(...(positions[view] ?? positions.orbit)); l.controls.target.set(0, 0.8, 0); l.controls.update();
  }, [view, kind]);
  return <div className="garage-preview" ref={host}>{error && <p role="alert">{error}</p>}</div>;
}
