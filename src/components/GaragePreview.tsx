import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetKit } from '../world/Assets';
import type { VehicleParts } from '../world/VehicleFactory';
import { VEHICLES, type VehicleKind } from '../world/Vehicles';
import { applyCustomization, clearCustomization, type VehicleCustomization } from '../world/VehicleCustomization';
import { frameGarageVehicle } from './GaragePartPreviews';

export function GaragePreview({ kind, build, view }: { kind: VehicleKind; build: VehicleCustomization; view: string }) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef<{ vehicle: VehicleParts; controls: OrbitControls; camera: THREE.PerspectiveCamera; frameView(): void } | null>(null);
  const [error, setError] = useState('');
  const latest = useRef(build); latest.current = build;
  const currentView = useRef(view); currentView.current = view;
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
    const rim = new THREE.DirectionalLight(0xdce4ed, 2.8); rim.position.set(-6, 4, 5); scene.add(rim);
    // Open studio floor: workshop walls must never occlude the orbit camera.
    const floorGeometry = new THREE.PlaneGeometry(150, 150);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.75 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const kit = new AssetKit(), vehicle = kit.car(kind); vehicle.group.position.y = 0.08; scene.add(vehicle.group);
    applyCustomization(vehicle, kind, latest.current);
    const frameView = () => {
      if (currentView.current === 'cockpit') return;
      controls.maxPolarAngle = Math.PI / 2;
      controls.target.copy(frameGarageVehicle(camera, vehicle.group, currentView.current));
      controls.maxDistance = Math.max(30, camera.position.distanceTo(controls.target) * 3);
      controls.update();
    };
    live.current = { vehicle, controls, camera, frameView };
    const resize = () => { const { width, height } = element.getBoundingClientRect(); renderer.setSize(Math.max(1, width), Math.max(1, height)); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); frameView(); };
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    let frame = 0;
    const draw = () => { if (controls.enabled) controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(draw); }; draw();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); clearCustomization(vehicle); floorGeometry.dispose(); floorMaterial.dispose(); kit.dispose(); key.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); live.current = null; };
  }, [kind]);
  useEffect(() => { if (live.current) applyCustomization(live.current.vehicle, kind, build); }, [kind, build]);
  useEffect(() => {
    const l = live.current; if (!l) return;
    const cockpit = view === 'cockpit';
    l.controls.enabled = !cockpit;
    l.vehicle.setOccupancy(false, cockpit);
    l.vehicle.glazing.visible = !cockpit;
    l.camera.near = cockpit ? 0.025 : 0.1;
    l.camera.fov = cockpit ? 64 : 42;
    l.camera.updateProjectionMatrix();
    if (cockpit) {
      l.vehicle.group.updateMatrixWorld(true);
      l.camera.position.copy(l.vehicle.eye); l.vehicle.body.localToWorld(l.camera.position);
      l.camera.lookAt(l.camera.position.clone().add(new THREE.Vector3(0, -0.08, -10)));
      return;
    }
    l.frameView();
  }, [view, kind, build.suspension]);
  return <div className="garage-preview" ref={host}>{error && <p role="alert">{error}</p>}</div>;
}
