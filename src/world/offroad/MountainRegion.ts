import * as THREE from 'three';
import * as C from 'cannon-es';
import type { Simulation } from '../Simulation';
import type { VehicleParts } from '../VehicleFactory';
import type { VehicleKind } from '../Vehicles';
import { MountainWorld } from './MountainWorld';
import { OffroadPhysics, type DriveInput } from './OffroadPhysics';
import { mountainLocal, mountainWorld, onMountain } from './MountainLocation';
import { height } from './Terrain';
import { groundPose, contactHeight } from './VehicleGrounding';
/** A streamed region of WorldEngine's scene, using the existing player, fleet and controls. */
export class MountainRegion {
  readonly root=new THREE.Scene();
  readonly physics=new OffroadPhysics();
  readonly terrain:MountainWorld;
  active=false;
  private kind:VehicleKind|null=null;
  private orientation=new THREE.Quaternion();
  private visualOffset=new THREE.Vector3();
  private halfTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
  private forward=new C.Vec3();
  private rearAxis=new C.Vec3(0,0,-1);
  private lastX=0; private lastZ=0;
  private parkBodies:C.Body[]=[];
  private parkedKey='';
  private visualVehicle:VehicleParts|null=null;
  readonly surfaceHeight=(x:number,z:number)=>contactHeight(x,z,this.terrain.chunks.get(`${Math.floor(x/128)},${Math.floor(z/128)}`)?.detail??2);
  constructor(private scene:THREE.Scene,private sim:Simulation,private getVehicle:(kind:VehicleKind)=>VehicleParts) {
    this.root.position.set(-510,0,-640);this.root.rotation.y=Math.PI;scene.add(this.root);
    this.terrain=new MountainWorld(this.root,this.physics.world,4);
    sim.terrainDrive=(dt,input)=>this.drive(dt,input);
    sim.terrainFootHeight=(x,z,y)=>{
      const p=mountainLocal(x,z);
      let support=this.surfaceHeight(p.x,p.z);
      // Query walkable rock/ledge tops, not just the analytic terrain underneath them.
      this.physics.world.raycastAll(new C.Vec3(p.x,Math.max(y,support)+.45,p.z),new C.Vec3(p.x,support-.5,p.z),{skipBackfaces:true},hit=>{
        if(hit.body===this.physics.body||this.parkBodies.includes(hit.body!)||hit.hitNormalWorld.y<.55)return;
        support=Math.max(support,hit.hitPointWorld.y);
      });
      return support;
    };
    sim.terrainBlocked=(x,z,y)=>{
      const p=mountainLocal(x,z);
      const feet=Math.max(y,sim.terrainFootHeight!(x,z,y));
      for(const body of this.physics.world.bodies){
        // Parked cars are checked against the current Simulation list, never stale physics proxies.
        if(body===this.physics.body||this.parkBodies.includes(body)||body.shapes[0] instanceof C.Heightfield)continue;
        if(body.aabbNeedsUpdate)body.updateAABB();
        const a=body.aabb;
        if(a.upperBound.y<=feet+.08)continue;
        const shape=body.shapes[0];
        if(shape instanceof C.Sphere){
          const dy=Math.max(0,feet+.15-body.position.y),r=Math.sqrt(Math.max(0,shape.radius*shape.radius-dy*dy));
          if(Math.hypot(p.x-body.position.x,p.z-body.position.z)<r+.35)return true;
        }else if(p.x+.35>a.lowerBound.x&&p.x-.35<a.upperBound.x&&p.z+.35>a.lowerBound.z&&p.z-.35<a.upperBound.z&&feet+1.6>a.lowerBound.y&&feet<a.upperBound.y)return true;
      }
      return false;
    };
  }
  update(){
    const s=this.sim,p=mountainLocal(s.x,s.z);
    if(s.z< -280){this.root.visible=true;this.terrain.update(p.x,Math.max(-100,p.z));}
    else if(this.terrain.chunks.size){this.terrain.clear();this.root.visible=false;}
    if(!s.driving||!onMountain(s.car.x,s.car.z)){this.active=false;this.restoreWheels();}
  }
  private drive(dt:number,input:DriveInput):boolean {
    const s=this.sim,p=mountainLocal(s.car.x,s.car.z);
    if(!onMountain(s.car.x,s.car.z)||p.z < -110){this.active=false;this.restoreWheels();return false;}
    this.terrain.update(p.x,p.z);
    if(!this.active||this.kind!==s.vehicleKind||Math.hypot(s.car.x-this.lastX,s.car.z-this.lastZ)>10){
      this.physics.configure(s.vehicleKind);this.kind=s.vehicleKind;
      const vehicle=this.getVehicle(s.vehicleKind);
      vehicle.spins.slice(0,4).forEach((spin,i)=>{const pivot=spin.parent!;if(!pivot.userData.mountainRest)pivot.userData.mountainRest=pivot.position.clone();const pos=pivot.userData.mountainRest as THREE.Vector3;this.physics.vehicle.wheelInfos[i].chassisConnectionPointLocal.set(pos.x,0,pos.z);});
      this.physics.recover(p.x,p.z);
      const pose=groundPose(vehicle,s.car.x,s.car.z,s.car.yaw);
      const q=pose.rotation.clone().premultiply(this.halfTurn);
      this.physics.body.quaternion.set(q.x,q.y,q.z,q.w);
      const mount=this.visualOffset.set(0,this.rideHeight-.08,0).applyQuaternion(q);
      this.physics.body.position.set(p.x+mount.x,pose.y+mount.y,p.z+mount.z);
      // Match the chassis collision underside to the factory's rendered sill height.
      const bottom=(Number(vehicle.group.userData.garageLayout?.groundY)||.2)+vehicle.body.position.y+.08-this.rideHeight;
      this.physics.body.shapeOffsets[0].y=bottom+.22;
      this.physics.body.updateBoundingRadius();this.physics.body.updateMassProperties();this.physics.body.aabbNeedsUpdate=true;
      this.physics.body.velocity.set(-Math.sin(s.car.yaw)*s.car.speed,0,Math.cos(s.car.yaw)*s.car.speed);
      this.active=true;
    }
    // Parked factory vehicles are physical obstacles, and disappear from physics when entered.
    const nearby=s.parked.filter(v=>Math.hypot(v.x-s.car.x,v.z-s.car.z)<90);
    const key=nearby.map(v=>`${v.kind}:${v.x}:${v.z}`).join('|');
    if(key!==this.parkedKey){for(const b of this.parkBodies)this.physics.world.removeBody(b);this.parkBodies=[];this.parkedKey=key;for(const v of nearby){const q=mountainLocal(v.x,v.z),b=new C.Body({mass:0,shape:new C.Box(new C.Vec3(.9,.8,2.1)),position:new C.Vec3(q.x,height(q.x,q.z)+.8,q.z)});b.quaternion.setFromEuler(0,Math.PI-v.yaw,0);this.physics.world.addBody(b);this.parkBodies.push(b);}}
    const oldSpeed=s.car.speed,oldYaw=s.car.yaw;
    this.physics.step(input,dt);
    const b=this.physics.body;this.physics.body.vectorToWorldFrame(this.rearAxis,this.forward);
    const w=mountainWorld(b.position.x,b.position.z);
    s.car.x=w.x;s.car.z=w.z;s.carY=b.position.y-this.rideHeight;
    s.car.yaw=Math.atan2(-this.forward.x,this.forward.z);s.car.speed=b.velocity.dot(this.forward);
    s.car.steer=input.steer;s.car.braking=input.brake||input.throttle*s.car.speed<-.1;
    s.car.wheelSpin=this.physics.vehicle.wheelInfos[0].rotation;s.acceleration=(s.car.speed-oldSpeed)/dt;s.skidding=this.physics.vehicle.sliding;
    s.lateralSpeed=b.velocity.x*this.forward.z-b.velocity.z*this.forward.x;s.carPitch=0;
    s.x=s.car.x;s.z=s.car.z;s.y=s.carY;s.facing=s.car.yaw;s.boosting=false;s.inPitLane=false;
    s.frontDistance=999;s.frontBlocked=false;
    if(s.view==='first')s.yaw+=Math.atan2(Math.sin(s.car.yaw-oldYaw),Math.cos(s.car.yaw-oldYaw));else if(s.cameraAutoFollow)s.yaw+=Math.atan2(Math.sin(s.car.yaw-s.yaw),Math.cos(s.car.yaw-s.yaw))*dt*2;
    this.lastX=s.car.x;this.lastZ=s.car.z;
    if(b.position.y<height(b.position.x,b.position.z)-12)this.recover();
    return true;
  }
  private get rideHeight(){return this.physics.spec.radius+.28;}
  recover(){
    if(!this.active)return;
    const b=this.physics.body,s=this.sim,position=mountainWorld(b.position.x,b.position.z);
    const pose=groundPose(this.getVehicle(s.vehicleKind),position.x,position.z,s.car.yaw);
    const q=pose.rotation.clone().premultiply(this.halfTurn);
    this.physics.recover(b.position.x,b.position.z);
    b.quaternion.set(q.x,q.y,q.z,q.w);
    const mount=this.visualOffset.set(0,this.rideHeight-.08,0).applyQuaternion(q);
    b.position.x+=mount.x;b.position.z+=mount.z;b.position.y=pose.y+mount.y+.15;
  }
  toggle(mode:'low'|'four'|'locked'){if(this.active)this.physics[mode]=!this.physics[mode];}
  private restoreWheels(){if(!this.visualVehicle)return;for(const spin of this.visualVehicle.spins){const pivot=spin.parent!;if(pivot.userData.mountainRest)pivot.position.copy(pivot.userData.mountainRest);}this.visualVehicle.group.rotation.z=0;this.visualVehicle=null;}
  render(vehicle:VehicleParts){
    if(!this.active)return;this.visualVehicle=vehicle;
    const b=this.physics.body;this.orientation.set(b.quaternion.x,b.quaternion.y,b.quaternion.z,b.quaternion.w).premultiply(this.halfTurn);
    // The factory's origin sits on the ground; offset along the chassis up axis as it rolls.
    const offset=this.visualOffset.set(0,.08-this.rideHeight,0).applyQuaternion(this.orientation);
    vehicle.group.position.set(-510-b.position.x,b.position.y,-640-b.position.z).add(offset);
    vehicle.group.quaternion.copy(this.orientation);vehicle.body.rotation.set(0,0,0);
    for(let i=0;i<Math.min(4,vehicle.spins.length);i++){
      const wheel=this.physics.vehicle.wheelInfos[i],spin=vehicle.spins[i],pivot=spin.parent!;
      const rest=pivot.userData.mountainRest as THREE.Vector3|undefined;
      if(rest)pivot.position.set(rest.x,this.rideHeight-.08-wheel.suspensionLength,rest.z);
      pivot.rotation.y=wheel.steering;spin.rotation.x=-wheel.rotation;
    }
  }
  dispose(){this.sim.terrainDrive=undefined;this.sim.terrainBlocked=undefined;this.sim.terrainFootHeight=undefined;this.terrain.dispose();for(const b of this.parkBodies)this.physics.world.removeBody(b);this.physics.dispose();this.scene.remove(this.root);}
}
