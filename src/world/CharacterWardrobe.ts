import * as THREE from 'three';
import type { Stickman } from './Assets';
import type { CharacterLook } from './CharacterLook';
const installed = new WeakMap<Stickman, () => void>();
export function clearCharacterLook(actor: Stickman) { installed.get(actor)?.(); installed.delete(actor); }
/** Clothing follows the existing animated joints; weapons remain attached to the hands. */
export function applyCharacterLook(actor: Stickman, look: CharacterLook) {
  clearCharacterLook(actor);
  const hidden: THREE.Object3D[] = [], additions: THREE.Object3D[] = [], resources: { dispose(): void }[] = [];
  const joints = [actor.hips, actor.torso, actor.head, ...actor.arms, ...actor.elbows, ...actor.legs, ...actor.knees];
  for (const joint of joints) for (const child of joint.children) if (child instanceof THREE.Mesh && child.visible) { child.visible = false; hidden.push(child); }
  const sphere = new THREE.SphereGeometry(1, 16, 12), box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 16); resources.push(sphere, box, cylinder);
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .82 }); resources.push(m); return m; };
  const skin = material(look.skin), top = material(look.topColor), bottom = material(look.bottomColor), hair = material(look.hairColor), shoe = material(look.shoeColor), accent = material(look.accent), dark = material('#151b21');
  function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) { const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow = true; parent.add(mesh); additions.push(mesh); return mesh; }
  const width = look.gender === 'Woman' ? .205 : look.gender === 'Nonbinary' ? .225 : .245;
  const bulky = ['Hoodie','Bomber','Parka','Varsity jacket'].includes(look.top);
  add(actor.hips,sphere,bottom,0,.02,0,.19,.15,.14);
  add(actor.torso,sphere,top,0,.31,0,width + (bulky ? .025 : 0),.33,.15);
  add(actor.head,cylinder,skin,0,.025,0,.065,.12,.065);
  add(actor.head,sphere,skin,0,.19,0,.13,.15,.125);
  for (const side of [-1,1]) {
    add(actor.head,sphere,skin,side*.13,.18,0,.025,.04,.022);
    add(actor.head,sphere,dark,side*.045,.21,-.116,.012,.009,.007);
  }
  add(actor.head,sphere,skin,0,.17,-.126,.022,.028,.022);
  if (look.hair !== 'Bald' && look.hat !== 'Helmet') {
    const big = look.hair === 'Afro';
    add(actor.head,sphere,hair,0,.29,.014,big ? .18 : .137,big ? .15 : look.hair === 'Buzz cut' ? .05 : .085,big ? .17 : .13);
    if (['Bob','Long','Ponytail'].includes(look.hair)) add(actor.head,sphere,hair,0,look.hair === 'Long' ? .08 : .17,.105,look.hair === 'Ponytail' ? .06 : .14,look.hair === 'Long' ? .23 : .14,.065);
    if (look.hair === 'Mohawk') add(actor.head,box,hair,0,.36,0,.045,.12,.21);
  }
  for(let i=0;i<2;i++) {
    const sleeveless = look.top === 'Tank top'; const short = sleeveless || ['T-shirt','Polo'].includes(look.top);
    add(actor.arms[i],sphere,sleeveless ? skin : top,0,-.14,0,.085,.19,.085);
    add(actor.elbows[i],sphere,short ? skin : top,0,-.13,0,.067,.17,.067);
    add(actor.elbows[i],sphere,skin,0,-.30,0,.065,.075,.05);
    add(actor.legs[i],cylinder,bottom,0,-.21,0,look.bottom === 'Cargo pants' ? .10 : .085,.43,.09);
    add(actor.knees[i],cylinder,['Shorts','Skirt'].includes(look.bottom) ? skin : bottom,0,-.18,0,.075,.39,.075);
    const boot = ['Boots','High tops'].includes(look.shoes);
    add(actor.knees[i],box,shoe,0,boot ? -.36 : -.42,-.06,.16,boot ? .20 : .10,.28);
    add(actor.knees[i],box,accent,0,-.46,-.06,.165,.025,.29);
    if (look.bottom === 'Cargo pants') add(actor.legs[i],box,bottom,i ? .085 : -.085,-.24,0,.055,.14,.12);
  }
  if (look.bottom === 'Skirt') { const geo = new THREE.CylinderGeometry(.19,.30,.38,24); resources.push(geo); add(actor.hips,geo,bottom,0,-.14,0,1,1,1); }
  if (look.top === 'Parka') add(actor.torso,box,top,0,.04,0,width*2,.35,.29);
  if (look.top === 'Hoodie') add(actor.torso,sphere,top,0,.57,.09,.18,.15,.12);
  if (!['Tank top','T-shirt'].includes(look.top)) add(actor.torso,box,accent,0,.31,-.153,.015,.48,.015);
  const topIndex = ['T-shirt','Hoodie','Bomber','Denim jacket','Leather jacket','Blazer','Parka','Tank top','Polo','Racing suit','Varsity jacket','Work shirt'].indexOf(look.top);
  for (let i=0;i<1+topIndex%3;i++) add(actor.torso,box,accent,-.09+i*.065,.42,-.15,.035,.025+topIndex*.002,.018);
  if (['Blazer','Denim jacket','Work shirt'].includes(look.top)) for (const side of [-1,1]) add(actor.torso,box,accent,side*.10,.49,-.14,.09,.10,.025).rotation.z=side*.35;
  if (look.hat !== 'None') { add(actor.head,sphere,look.hat === 'Helmet' ? accent : top,0,.31,0,.155,look.hat === 'Beanie' ? .12 : .09,.15); if(look.hat === 'Cap') add(actor.head,box,top,0,.29,-.15,.23,.025,.17); }
  if (look.glasses) { for(const side of [-1,1]) add(actor.head,box,dark,side*.06,.21,-.125,.09,.045,.02); add(actor.head,box,dark,0,.21,-.13,.04,.012,.02); }
  if (look.backpack) { add(actor.torso,box,accent,0,.30,.20,.31,.40,.16); for(const side of [-1,1]) add(actor.torso,box,dark,side*.14,.35,-.15,.035,.40,.025); }
  installed.set(actor,()=>{ for(const item of additions) item.removeFromParent(); for(const item of hidden) item.visible=true; resources.forEach(r=>r.dispose()); });
}
