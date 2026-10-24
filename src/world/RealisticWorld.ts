import * as THREE from 'three';
import type { AssetKit } from './Assets';
import { FOREST, FOREST_TREES, FOREST_ROAD_PATHS, forestHeight } from './ForestIsland';

/** Small deterministic, local textures: no remote asset downloads at startup. */
function surface(kind: 'stone' | 'asphalt' | 'brick' | 'soil'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  let seed = 812;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const data = ctx.createImageData(256, 256);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 170 + random() * 65;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  if (kind === 'brick' || kind === 'stone') {
    ctx.strokeStyle = kind === 'brick' ? '#93938b' : '#b8b8b3'; ctx.lineWidth = 2;
    const row = kind === 'brick' ? 32 : 128;
    for (let y = 0; y <= 256; y += row) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      for (let x = ((y / row) % 2) * 64; x <= 256; x += 128) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + row); ctx.stroke();
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function upgradeCityMaterials(kit: AssetKit): void {
  for (const [name, kind, repeat, bump] of [
    ['road', 'asphalt', 40, 0.025], ['pavement', 'stone', 30, 0.035],
    ['wall0', 'stone', 4, 0.035], ['wall1', 'brick', 5, 0.055], ['wall2', 'stone', 4, 0.025],
  ] as const) {
    const texture = surface(kind); texture.repeat.set(repeat, repeat);
    const mat = kit.materials[name]; mat.map = texture;
    // Bump maps are non-color data and therefore use a separate texture view.
    const height = texture.clone(); height.colorSpace = THREE.NoColorSpace; height.needsUpdate = true;
    mat.userData.detailBump = height; mat.bumpScale = bump; mat.needsUpdate = true;
    kit.extra.push(texture, height);
  }
  kit.materials.leaf.flatShading = false;
  kit.materials.glass.envMapIntensity = 0.8;
  kit.materials.windowLit.envMapIntensity = 0.8;
}

/** Baked sky illumination for PBR glass, paint and metals; generated once. */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const scene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(50, 24, 16);
  const material = new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 p; void main(){
      vec3 d=normalize(p); float h=smoothstep(-0.15,0.8,d.y);
      vec3 sky=mix(vec3(0.65,0.71,0.72),vec3(0.23,0.43,0.68),h);
      sky=mix(vec3(0.12,0.15,0.10),sky,smoothstep(-0.2,0.02,d.y));
      sky+=vec3(3.0,2.5,1.8)*pow(max(dot(d,normalize(vec3(-0.4,0.8,0.3))),0.0),128.0);
      gl_FragColor=vec4(sky,1.0);
    }`,
  });
  scene.add(new THREE.Mesh(geometry, material));
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0.04, 0.1, 100);
  generator.dispose(); geometry.dispose(); material.dispose();
  return target;
}

export function buildForestIsland(scene: THREE.Scene, kit: AssetKit): void {
  const soilTexture = surface('soil'); soilTexture.repeat.set(65, 45);
  const soil = new THREE.MeshStandardMaterial({ color: 0x303d2c, map: soilTexture, roughness: 1 });
  const bark = new THREE.MeshLambertMaterial({ color: 0x423c35 });
  const needles = new THREE.MeshLambertMaterial({ color: 0x233c31 });
  const water = new THREE.MeshStandardMaterial({ color: 0x244e5e, roughness: 0.28, metalness: 0.25 });
  kit.extra.push(soilTexture, soil, bark, needles, water);
  // Polar rings give the shore a smooth silhouette and keep the road terrain exact.
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const rings = 12, slices = 96;
  for (let ring = 0; ring <= rings; ring++) for (let i = 0; i <= slices; i++) {
    const a = i / slices * Math.PI * 2, r = ring / rings;
    const x = FOREST.x + Math.cos(a) * FOREST.rx * r, z = Math.sin(a) * FOREST.rz * r;
    const shore = Math.max(0, (r - 0.96) / 0.04);
    positions.push(x, forestHeight(x, z) - shore * 2.5 - 0.04, z);
    uv.push((x + 740) / 460, (z + 170) / 340);
    if (ring < rings && i < slices) {
      const n = ring * (slices + 1) + i;
      indices.push(n, n + 1, n + slices + 1, n + 1, n + slices + 2, n + slices + 1);
    }
  }
  const terrain = new THREE.BufferGeometry(); terrain.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  terrain.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); terrain.setIndex(indices); terrain.computeVertexNormals();
  const land = new THREE.Mesh(terrain, soil); land.receiveShadow = true; scene.add(land); kit.extra.push(terrain);
  const seaGeo = new THREE.PlaneGeometry(1000, 850);
  const sea = new THREE.Mesh(seaGeo, water); sea.rotation.x = -Math.PI / 2; sea.position.set(-620, -1.7, 0); scene.add(sea); kit.extra.push(seaGeo);
  const trunkGeometry = new THREE.CylinderGeometry(0.65, 1, 1, 5, 1, true);
  const crownGeometry = new THREE.ConeGeometry(1, 1, 7, 1, true);
  const trunks = new THREE.InstancedMesh(trunkGeometry, bark, FOREST_TREES.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, needles, FOREST_TREES.length);
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  FOREST_TREES.forEach((tree, i) => {
    const y = forestHeight(tree.x, tree.z);
    dummy.position.set(tree.x, y + tree.height * 0.5, tree.z);
    dummy.scale.set(tree.radius, tree.height, tree.radius); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(tree.x, y + tree.height * 0.61, tree.z);
    dummy.scale.set(tree.height * 0.23, tree.height * 0.9, tree.height * 0.23);
    dummy.rotation.y = i * 2.399; dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.30 + (i % 9) * 0.005, 0.22, 0.3 + (i % 7) * 0.02);
    crowns.setColorAt(i, color);
  });
  // Dense canopy uses inexpensive diffuse shading, with no second shadow pass.
  trunks.castShadow = crowns.castShadow = false;
  trunks.receiveShadow = crowns.receiveShadow = false;
  trunks.userData.forest = crowns.userData.forest = true;
  trunks.computeBoundingSphere(); crowns.computeBoundingSphere(); scene.add(trunks, crowns);
  kit.extra.push(trunkGeometry, crownGeometry);
  // Segment geometry shares its centerline with road friction, navigation and clearances.
  for (const path of FOREST_ROAD_PATHS) for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
    const length = Math.hypot(b.x - a.x, b.z - a.z), yaw = -Math.atan2(b.z - a.z, b.x - a.x);
    kit.stamp('box', 'pavement', x, -0.10, z, length + 0.2, 0.16, 14, yaw);
    kit.stamp('box', 'road', x, -0.015, z, length + 0.15, 0.06, 12, yaw);
    if (i % 3 !== 0) kit.stamp('box', 'white', x, 0.022, z, length, 0.012, 0.14, yaw);
    for (const side of [-1, 1]) {
      const dx = Math.sin(yaw) * side, dz = Math.cos(yaw) * side;
      kit.stamp('box', 'white', x + dx * 5.6, 0.023, z + dz * 5.6, length + 0.1, 0.012, 0.12, yaw);
      if (x > -290) {
        kit.stamp('box', 'metal', x + dx * 7.6, 0.85, z + dz * 7.6, length + 0.1, 0.3, 0.15, yaw);
        kit.stamp('box', 'metal', x + dx * 7.6, 0.45, z + dz * 7.6, 0.14, 0.9, 0.14);
      }
    }
    if (x > -280 && i % 6 === 0) kit.stamp('box', 'wall2', x, -2.5, z, 1, 5, 12);
  }
  kit.sign(scene, 'EVERGREEN ISLAND', -210, 4.4, -8, 14, Math.PI / 2);
  kit.sign(scene, 'DARKWOOD LOOP', -346, 3.5, -9, 10, Math.PI / 2);
  kit.flush(scene);
}
