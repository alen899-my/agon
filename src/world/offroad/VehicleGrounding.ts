import * as THREE from 'three';
import type { VehicleParts } from '../VehicleFactory';
import { mountainLocal } from './MountainLocation';
import { height } from './Terrain';
/** Interpolate the exact triangles used by the resident two-metre heightfield. */
export function contactHeight(x:number,z:number,step=2):number {
  const gx=Math.floor(x/step)*step,gz=Math.floor(z/step)*step,u=(x-gx)/step,v=(z-gz)/step;
  const a=height(gx,gz),b=height(gx+step,gz),c=height(gx,gz+step),d=height(gx+step,gz+step);
  return u>=v ? a+(b-a)*u+(d-b)*v : a+(d-c)*u+(c-a)*v;
}
export function groundPose(vehicle:VehicleParts,x:number,z:number,yaw:number,sampleHeight=contactHeight) {
  const pivots=vehicle.spins.slice(0,4).map(s=>{
    const p=s.parent!;
    if(!p.userData.mountainRest)p.userData.mountainRest=p.position.clone();
    return p.userData.mountainRest as THREE.Vector3;
  });
  const sample=(p:THREE.Vector3)=>{const c=Math.cos(yaw),s=Math.sin(yaw),q=mountainLocal(x+p.x*c-p.z*s,z+p.x*s+p.z*c);return sampleHeight(q.x,q.z);};
  const heights=pivots.map(sample),front=(heights[0]+heights[1])/2,rear=(heights[2]+heights[3])/2;
  const pitch=Math.atan2(front-rear,Math.abs(pivots[2].z-pivots[0].z));
  const roll=Math.atan2((heights[1]+heights[3]-heights[0]-heights[2])/2,Math.abs(pivots[1].x-pivots[0].x));
  const rotation=new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch,-yaw,roll,'YXZ'));
  let y=-Infinity;
  pivots.forEach((p,i)=>{const offset=p.clone().applyQuaternion(rotation);const radius=Number(vehicle.spins[i].userData.wheelRadius)||.35;y=Math.max(y,heights[i]+radius-offset.y);});
  // Account for a crest under the chassis as well as the four wheel patches.
  const layout=vehicle.group.userData.garageLayout;
  const belly=(Number(layout?.groundY)||.2)+vehicle.body.position.y;
  const halfWidth=Math.max(...pivots.map(p=>Math.abs(p.x)))*.85;
  for(const px of [-halfWidth,0,halfWidth])for(let k=0;k<=4;k++){
    const p=new THREE.Vector3(px,belly,THREE.MathUtils.lerp(pivots[0].z,pivots[2].z,k/4)).applyQuaternion(rotation),q=mountainLocal(x+p.x,z+p.z);
    y=Math.max(y,sampleHeight(q.x,q.z)+.025-p.y);
  }
  return {y,rotation};
}
export function placeGrounded(vehicle:VehicleParts,x:number,z:number,yaw:number,sampleHeight=contactHeight) {
  const pose=groundPose(vehicle,x,z,yaw,sampleHeight);vehicle.group.position.set(x,pose.y,z);vehicle.group.quaternion.copy(pose.rotation);
  const up=new THREE.Vector3(0,1,0).applyQuaternion(pose.rotation);
  for(const spin of vehicle.spins.slice(0,4)){
    const pivot=spin.parent!,rest=pivot.userData.mountainRest as THREE.Vector3;
    const p=rest.clone().applyQuaternion(pose.rotation).add(vehicle.group.position),q=mountainLocal(p.x,p.z);
    const delta=(sampleHeight(q.x,q.z)+(Number(spin.userData.wheelRadius)||.35)-p.y)/Math.max(.2,up.y);
    pivot.position.copy(rest);pivot.position.y+=THREE.MathUtils.clamp(delta,-.3,.3);
  }
}
