import * as THREE from 'three';
import * as C from 'cannon-es';
import { CHUNK, hash, height, surface, SURFACES, trailDistance, trailX } from './Terrain';
interface Chunk { group: THREE.Group; bodies: C.Body[]; detail: number; }
/** Render LOD and physics residency are independent; every near chunk has exact heightfield collision. */
export class MountainWorld {
  chunks = new Map<string, Chunk>();
  private ground = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  private rock = new THREE.MeshStandardMaterial({ color: 0x77766a, roughness: 1 });
  private foliage = new THREE.MeshStandardMaterial({ color: 0x354a32, roughness: 1 });
  private bark = new THREE.MeshStandardMaterial({ color: 0x514535, roughness: 1 });
  private rockGeo = new THREE.DodecahedronGeometry(1, 0);
  private treeGeo = new THREE.ConeGeometry(2.3, 7, 7);
  private trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 3, 5);
  private center = '';
  constructor(private scene: THREE.Scene, private physics: C.World, private radius = 4) {}
  update(x: number, z: number) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), center = `${cx},${cz}`;
    if (center === this.center) return; this.center = center;
    const wanted = new Set<string>();
    for (let dz = -this.radius; dz <= this.radius; dz++) for (let dx = -this.radius; dx <= this.radius; dx++) {
      if (cz + dz < -1) continue;
      const key = `${cx + dx},${cz + dz}`; wanted.add(key);
      const detail = Math.max(Math.abs(dx), Math.abs(dz)) <= 1 ? 2 : Math.max(Math.abs(dx), Math.abs(dz)) <= 2 ? 8 : 16;
      const old = this.chunks.get(key);
      if (old?.detail === detail) continue;
      if (old) this.remove(key);
      this.chunks.set(key, this.build((cx + dx) * CHUNK, (cz + dz) * CHUNK, detail));
    }
    for (const key of this.chunks.keys()) if (!wanted.has(key)) this.remove(key);
  }
  private build(ox: number, oz: number, step: number): Chunk {
    const group = new THREE.Group(), bodies: C.Body[] = [], n = CHUNK / step;
    const vertices: number[] = [], colors: number[] = [], indices: number[] = [], data: number[][] = [];
    const color = new THREE.Color();
    for (let i = 0; i <= n; i++) { data[i] = []; for (let j = 0; j <= n; j++) {
      const x = ox + i * step, z = oz + CHUNK - j * step, y = height(x, z); data[i][j] = y;
      vertices.push(x, y, z);
      color.setHex(trailDistance(x, z) < 5 || surface(x, z) === 'rock' ? SURFACES[surface(x, z)].color : 0x65704b);
      color.multiplyScalar(0.86 + hash(x, z) * 0.23); colors.push(color.r, color.g, color.b);
      if (i < n && j < n) { const a = i * (n + 1) + j, b = a + n + 1; indices.push(a, b, a + 1, b, b + 1, a + 1); }
    } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, this.ground); mesh.receiveShadow = true; group.add(mesh);
    // Vertical skirts conceal mismatched distant LOD edges without altering nearby driving surfaces.
    const skirtV: number[] = [], skirtC: number[] = [], skirtI: number[] = [];
    const edge = (ids: number[]) => { for (let k = 0; k < ids.length - 1; k++) { const start = skirtV.length / 3; for (const id of [ids[k], ids[k + 1]]) for (const drop of [0, 12]) { skirtV.push(vertices[id * 3], vertices[id * 3 + 1] - drop, vertices[id * 3 + 2]); skirtC.push(...colors.slice(id * 3, id * 3 + 3)); } skirtI.push(start, start + 1, start + 2, start + 2, start + 1, start + 3); } };
    edge(Array.from({length:n+1},(_,i)=>i)); edge(Array.from({length:n+1},(_,i)=>n*(n+1)+n-i)); edge(Array.from({length:n+1},(_,i)=>(n-i)*(n+1))); edge(Array.from({length:n+1},(_,i)=>i*(n+1)+n));
    const skirt = new THREE.BufferGeometry(); skirt.setAttribute('position', new THREE.Float32BufferAttribute(skirtV,3)); skirt.setAttribute('color',new THREE.Float32BufferAttribute(skirtC,3)); skirt.setIndex(skirtI); skirt.computeVertexNormals(); group.add(new THREE.Mesh(skirt,this.ground));
    if (step === 2) {
      const body = new C.Body({ mass: 0 }); body.addShape(new C.Heightfield(data, { elementSize: step })); body.position.set(ox, 0, oz + CHUNK); body.quaternion.setFromEuler(-Math.PI / 2, 0, 0); this.physics.addBody(body); bodies.push(body);
    }
    const count = 26, rocks = new THREE.InstancedMesh(this.rockGeo, this.rock, count), trees = new THREE.InstancedMesh(this.treeGeo, this.foliage, count), trunks = new THREE.InstancedMesh(this.trunkGeo, this.bark, count);
    const dummy = new THREE.Object3D(); let rc = 0, tc = 0;
    for (let i = 0; i < count; i++) {
      const x = ox + hash(ox + i, oz + 7) * CHUNK, z = oz + hash(ox - 2, oz + i) * CHUNK;
      if (trailDistance(x, z) < 10 || z < 30) continue;
      const y = height(x, z), scale = 0.5 + hash(x + 2, z) * 2;
      dummy.position.set(x, y + scale * 0.2, z); dummy.rotation.set(0, hash(x, z) * 6, 0); dummy.scale.set(scale, scale * 0.7, scale); dummy.updateMatrix(); rocks.setMatrixAt(rc++, dummy.matrix);
      if (step === 2) { const body = new C.Body({mass:0, shape:new C.Sphere(scale * 0.8), position:new C.Vec3(x, y + scale * 0.2, z)}); this.physics.addBody(body); bodies.push(body); }
      if (y < 175 && trailDistance(x + 3,z) > 10) {
        dummy.position.set(x + 3, height(x + 3,z) + 5, z); dummy.scale.setScalar(0.8 + hash(x,z)); dummy.updateMatrix(); trees.setMatrixAt(tc, dummy.matrix);
        dummy.position.y -= 3.5; dummy.scale.setScalar(1); dummy.updateMatrix(); trunks.setMatrixAt(tc++, dummy.matrix);
        if(step===2) { const body=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.3,1.5,.3)),position:new C.Vec3(x+3,height(x+3,z)+1.5,z)});this.physics.addBody(body);bodies.push(body); }
      }
    }
    rocks.count = rc; trees.count = trunks.count = tc; rocks.castShadow = trees.castShadow = step === 2; group.add(rocks, trees, trunks);
    if(oz<=185 && oz+CHUNK>185) { const x=trailX(185); if(x>=ox&&x<ox+CHUNK) { const water=new THREE.Mesh(new THREE.PlaneGeometry(10,8),new THREE.MeshStandardMaterial({color:0x75938b,transparent:true,opacity:.6,roughness:.2,metalness:.2}));water.rotation.x=-Math.PI/2;water.position.set(x,height(x,185)+.18,185);group.add(water); } }
    this.scene.add(group); return { group, bodies, detail: step };
  }
  private remove(key: string) { const chunk = this.chunks.get(key)!; this.scene.remove(chunk.group); for(const b of chunk.bodies) this.physics.removeBody(b); chunk.group.traverse(o=>{ if(o instanceof THREE.InstancedMesh)o.dispose(); if(o instanceof THREE.Mesh && ![this.rockGeo,this.treeGeo,this.trunkGeo].includes(o.geometry)) { o.geometry.dispose(); if(o.material!==this.ground&&o.material!==this.rock) (o.material as THREE.Material).dispose(); } }); this.chunks.delete(key); }
  clear() { for(const key of this.chunks.keys()) this.remove(key); this.center=""; }
  dispose() { for(const key of this.chunks.keys()) this.remove(key); for(const g of [this.rockGeo,this.treeGeo,this.trunkGeo]) g.dispose(); for(const m of [this.ground,this.rock,this.foliage,this.bark]) m.dispose(); }
}

