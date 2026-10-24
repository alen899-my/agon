import * as THREE from 'three';
import { AssetKit, type Stickman } from './Assets';
import { BEACH, BEACH_PROPS, BEACH_PALMS, beachHeight } from './BeachData';

/** One wave draw, instanced furniture, and a small distance-gated group of visitors. */
export class BeachScene {
  private readonly water: THREE.Mesh;
  private readonly wave: THREE.ShaderMaterial;
  private readonly visitors: { actor: Stickman; x: number; z: number; role: number }[] = [];
  private readonly ball: THREE.Mesh;
  private nextAnimation = 0;
  private visible = false;
  constructor(private scene: THREE.Scene, kit: AssetKit) {
    const sand = new THREE.MeshStandardMaterial({ color: 0xd9c394, roughness: 1, vertexColors: true });
    const land = new THREE.PlaneGeometry(224, 114, 32, 24); land.rotateX(-Math.PI / 2);
    const p = land.attributes.position, colors: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) - 510, z = p.getZ(i) + 197;
      p.setY(i, beachHeight(x, z) + 0.015);
      const wet = THREE.MathUtils.smoothstep(z, 211, 240);
      const grain = 0.97 + Math.sin(x * 17 + z * 23) * 0.025;
      colors.push(grain * (1 - wet * 0.27), grain * (1 - wet * 0.24), grain * (1 - wet * 0.19));
    }
    land.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); land.computeVertexNormals();
    const beach = new THREE.Mesh(land, sand); beach.position.set(-510, 0, 197); beach.receiveShadow = true; scene.add(beach);
    kit.extra.push(land, sand);
    this.wave = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, light: { value: 1 } },
      vertexShader: `uniform float time; varying vec3 world; varying vec3 normalWave;
      void main(){vec3 p=position; float a=p.x*.055+p.z*.12-time*1.4; float b=p.x*.13-p.z*.08-time*.85;
      p.y+=sin(a)*.13+sin(b)*.055; normalWave=normalize(vec3(-cos(a)*.00715-cos(b)*.00715,1.,-cos(a)*.0156+cos(b)*.0044));
      world=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);}`,
      fragmentShader: `uniform float time; uniform float light; varying vec3 world; varying vec3 normalWave;
      void main(){vec3 n=normalize(normalWave);vec3 eye=normalize(cameraPosition-world);
      float shore=1.-smoothstep(241.,285.,world.z);float bay=(1.-smoothstep(100.,135.,abs(world.x+510.)))*smoothstep(220.,240.,world.z);
      vec3 water=mix(vec3(.025,.15,.20),vec3(.08,.48,.43),shore*bay);
      float fresnel=pow(1.-max(dot(n,eye),0.),4.);water=mix(water,vec3(.42,.60,.65),fresnel*.65);
      float spec=pow(max(dot(reflect(-normalize(vec3(.4,.8,.3)),n),eye),0.),80.);
      float crest=sin(world.z*.65+sin(world.x*.07)*.8-time*1.9);
      float foam=smoothstep(.72,.98,crest)*exp(-abs(world.z-243.)*.14)*bay;
      water=mix(water,vec3(.85,.91,.86),foam*.85);water+=spec*.45;
      gl_FragColor=vec4(water*light,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }` });
    const seaGeometry = new THREE.PlaneGeometry(1000, 1000, 96, 96); seaGeometry.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(seaGeometry, this.wave); this.water.userData.dynamicScenery = true; this.water.position.set(-620, -1.7, 50); scene.add(this.water);
    // Access road and shoreline drive; furniture is kept behind the shoulders.
    kit.stamp('box', 'pavement', -510, -0.04, 145, 14, 0.12, 74);
    kit.stamp('box', 'road', -510, 0.025, 145, 12, 0.035, 74);
    kit.stamp('box', 'pavement', -510, -0.04, 182, 180, 0.12, 14);
    kit.stamp('box', 'road', -510, 0.025, 182, 180, 0.035, 12);
    for (let z = 112; z < 175; z += 7) kit.stamp('box', 'white', -510, 0.05, z, .12, .01, 3);
    for (let x = -593; x < -425; x += 7) if (Math.abs(x + 510) > 9) kit.stamp('box', 'white', x, 0.05, 182, 3, .01, .12);
    for (const x of [-600, -420]) kit.stamp('cylinder', 'road', x, 0.025, 182, 11, .035, 11);
    const canopyGeometry = new THREE.ConeGeometry(3.5, 1.1, 12);
    const canopyMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, BEACH_PROPS.length);
    const matrix = new THREE.Object3D();
    BEACH_PROPS.forEach((spot, i) => {
      kit.stamp('cylinder', 'metal', spot.x, 1.4, spot.z, .075, 2.8, .075);
      matrix.position.set(spot.x, 3, spot.z); matrix.updateMatrix(); canopies.setMatrixAt(i, matrix.matrix);
      canopies.setColorAt(i, new THREE.Color([0xc55d48, 0xede0b5, 0x488f99, 0xe3b85a][i]));
      for (const side of [-1, 1]) {
        kit.stamp('box', 'white', spot.x + side * 1.4, .35, spot.z, .8, .12, 2.2);
        kit.stamp('box', 'wall1', spot.x + side * 1.4, .65, spot.z - .8, .8, .6, .12);
      }
    }); scene.add(canopies); kit.extra.push(canopyGeometry, canopyMaterial);
    // Shared four-triangle fronds give the coast palms without expensive leaf cards.
    const frond = new THREE.BufferGeometry();
    frond.setAttribute('position', new THREE.Float32BufferAttribute([
      0,0,0, -.65,.35,1.5, .65,.35,1.5, -.48,.1,3.2, .48,.1,3.2, 0,-.75,4.5,
    ], 3));
    frond.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]); frond.computeVertexNormals();
    const palmMaterial = new THREE.MeshLambertMaterial({ color: 0x507342, side: THREE.DoubleSide });
    const palms = new THREE.InstancedMesh(frond, palmMaterial, BEACH_PALMS.length * 7);
    BEACH_PALMS.forEach((p, i) => {
      kit.stamp('cylinder', 'wall1', p.x, 3.3, p.z, .22, 6.6, .22);
      for (let leaf = 0; leaf < 7; leaf++) {
        matrix.position.set(p.x, 6.5, p.z); matrix.rotation.set(0, leaf / 7 * Math.PI * 2 + i, 0);
        matrix.updateMatrix(); palms.setMatrixAt(i * 7 + leaf, matrix.matrix);
      }
    }); scene.add(palms); kit.extra.push(frond, palmMaterial);
    // Volleyball net: opaque thin strips avoid transparent overdraw.
    for (const x of [-531, -519]) kit.stamp('cylinder', 'metal', x, 1.2, 215, .07, 2.4, .07);
    for (let y = 1.3; y <= 2.4; y += .18) kit.stamp('box', 'white', -525, y, 215, 12, .025, .025);
    for (let x = -531; x <= -519; x += .4) kit.stamp('box', 'white', x, 1.85, 215, .02, 1.1, .02);
    kit.sign(scene, 'SUNSET BEACH  /  COAST ROAD', -519, 3.5, 122, 14, Math.PI);
    kit.sign(scene, 'SUNSET BEACH', -505, 3.4, 195, 12);
    kit.flush(scene);
    // Four resting visitors, four players and two walkers. No AI/pathfinding population.
    for (let i = 0; i < 10; i++) {
      const actor = kit.stickman(false, i + 1);
      actor.group.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = false; });
      const x = i < 4 ? BEACH_PROPS[i].x + 1.4 : i < 8 ? -529 + (i % 2) * 8 : -575 + (i - 8) * 80;
      const z = i < 4 ? 210 : i < 8 ? 211 + (i < 6 ? 0 : 8) : 224;
      this.visitors.push({ actor, x, z, role: i < 4 ? 0 : i < 8 ? 1 : 2 });
    }
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 7), new THREE.MeshLambertMaterial({ color: 0xf5db88 }));
    this.ball.userData.dynamicScenery = true;
    this.ball.visible = false; scene.add(this.ball);
    kit.extra.push({ dispose: () => this.dispose() });
  }
  update(time: number, x: number, z: number, low: boolean, night: number): void {
    const distance = Math.hypot(x - BEACH.x, z - BEACH.z);
    this.water.visible = x < -140; this.wave.uniforms.time.value = time; this.wave.uniforms.light.value = 1 - night * .8;
    const visible = distance < (low ? 85 : 120);
    if (visible !== this.visible) {
      this.visible = visible; this.ball.visible = visible;
      for (const visitor of this.visitors) { if (visible) this.scene.add(visitor.actor.group); else visitor.actor.group.removeFromParent(); }
    }
    if (!visible || time < this.nextAnimation && this.nextAnimation - time < 1) return;
    this.nextAnimation = time + (low ? .1 : .05);
    for (let i = 0; i < this.visitors.length; i++) {
      const v = this.visitors[i], walk = v.role === 2;
      const px = v.x + (walk ? Math.sin(time * .1 + i) * 12 : v.role === 1 ? Math.sin(time + i) * .5 : 0);
      v.actor.group.position.set(px, v.role === 0 ? .6 : beachHeight(px, v.z) + .08, v.z + (v.role === 0 ? .8 : 0));
      v.actor.group.rotation.x = v.role === 0 ? -Math.PI / 2 + .12 : 0;
      v.actor.group.rotation.y = walk ? Math.cos(time * .1 + i) > 0 ? -Math.PI / 2 : Math.PI / 2 : v.role === 1 && i >= 6 ? Math.PI : 0;
      v.actor.animate({ phase: time * 3 + i, intensity: walk ? .6 : 0, airborne: false, dip: v.role === 0 ? .8 : 0,
        idle: time, activity: v.role === 0 ? 'sit' : undefined, cheer: v.role === 1 ? .55 + Math.sin(time * 2 + i) * .35 : 0 });
    }
    this.ball.position.set(-525 + Math.sin(time * 1.4) * 3, 1.2 + Math.abs(Math.cos(time * 1.4)) * 3, 215 + Math.sin(time * 1.4) * 5);
  }
  private dispose(): void {
    this.water.removeFromParent(); this.water.geometry.dispose(); this.wave.dispose();
    this.ball.removeFromParent(); this.ball.geometry.dispose(); (this.ball.material as THREE.Material).dispose();
    for (const v of this.visitors) v.actor.group.removeFromParent();
  }
}
