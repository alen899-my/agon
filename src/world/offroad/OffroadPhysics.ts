import * as C from 'cannon-es';
import { RIGS, type Rig } from './Rigs';
import { VEHICLES, type VehicleKind } from '../Vehicles';
import { VEHICLE_DESIGNS } from '../VehicleDesigns';
import { height, surface, SURFACES, trailX, clamp } from './Terrain';
export interface DriveInput { throttle: number; steer: number; brake: boolean; }
export class OffroadPhysics {
  readonly world = new C.World({gravity:new C.Vec3(0,-9.81,0)});
  vehicle!: C.RaycastVehicle;
  body!: C.Body;
  spec: Rig = RIGS[0];
  selected=0; low=false; four=true; locked=false; gear=1; rpm=900; steering=0; surface='dirt';
  private autoCrawl=false;
  private slipping = [false,false,false,false]; private axis = new C.Vec3(0,0,-1); private forward = new C.Vec3(); private resistance = new C.Vec3();
  constructor() { this.world.broadphase=new C.SAPBroadphase(this.world);this.world.defaultContactMaterial.friction=.65;this.world.defaultContactMaterial.restitution=.02;this.select(0); }
  select(index:number, spec:Rig=RIGS[index]) {
    const pos=this.body?.position.clone();if(this.vehicle)this.vehicle.removeFromWorld(this.world);
    this.selected=index;this.spec=spec;this.autoCrawl=false;const s=spec;this.body=new C.Body({mass:s.mass,linearDamping:.015,angularDamping:.18,allowSleep:false});
    // Low frame and elevated cabin retain meaningful roll inertia and roof collisions.
    this.body.addShape(new C.Box(new C.Vec3(s.width*.46,.22,s.length*.47)),new C.Vec3(0,-.1,0));
    this.body.addShape(new C.Box(new C.Vec3(s.width*.43,.38,s.cabin*.45)),new C.Vec3(0,.62,s.length/2-s.cabin/2-.22));
    this.vehicle=new C.RaycastVehicle({chassisBody:this.body,indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2});
    for(const z of [-s.wheelbase/2,s.wheelbase/2])for(const side of [-1,1])this.vehicle.addWheel({radius:s.radius,directionLocal:new C.Vec3(0,-1,0),axleLocal:new C.Vec3(-1,0,0),chassisConnectionPointLocal:new C.Vec3(side*s.track/2,0,z),suspensionRestLength:.36,maxSuspensionTravel:s.travel,suspensionStiffness:32,dampingRelaxation:3.2,dampingCompression:4.4,frictionSlip:1.35,rollInfluence:.85,maxSuspensionForce:s.mass*9.81*.9,useCustomSlidingRotationalSpeed:true,customSlidingRotationalSpeed:-18});
    this.vehicle.addToWorld(this.world);this.recover(pos?.x??trailX(0),pos?.z??0);
  }
  configure(kind:VehicleKind) {
    const index=kind==='gypsy'?0:kind==='thar'?1:kind==='pajero'?2:-1;
    if(index>=0){this.select(index);this.four=true;return;}
    const v=VEHICLES[kind],d=kind==='f1'||kind==='nascar'?null:VEHICLE_DESIGNS[kind];
    this.select(0,{...RIGS[0],name:v.name,mass:v.category==='truck'?2600:v.category==='suv'?1900:1450,length:v.length,width:v.width,wheelbase:v.length*(d?d.axleRear-d.axleFront:.64),track:v.width-.26,radius:d?.wheel??.34,torque:v.category==='sport'?300:180,travel:v.category==='suv'?.25:.12,cabin:v.length*.6});
    this.four=v.category==='suv';
  }
  recover(x=this.body.position.x,z=this.body.position.z) {this.body.position.set(x,height(x,z)+1.5,z);this.body.quaternion.set(0,0,0,1);this.body.velocity.setZero();this.body.angularVelocity.setZero();this.body.force.setZero();this.body.torque.setZero();this.body.aabbNeedsUpdate=true;this.gear=1;this.steering=0;}
  step(input:DriveInput,dt:number) {
    const s=this.spec;this.body.vectorToWorldFrame(this.axis,this.forward);const speed=this.body.velocity.dot(this.forward);
    // Small rollback must not lock out uphill torque; brake before reversing at road speeds.
    const reversing=input.throttle<0&&speed<1, braking=input.throttle<0&&speed>=1||input.throttle>0&&speed<-2;
    const throttle=braking?0:Math.abs(input.throttle), ratios=[3.8,2.2,1.45,1,.82];
    const uphill=this.forward.y*(reversing?-1:1)>.10;
    // Hold reduction through a climb instead of repeatedly dropping torque at 5 m/s.
    if(!this.four||Math.abs(speed)>8||this.forward.y*(reversing?-1:1)<.035)this.autoCrawl=false;
    else if(uphill&&Math.abs(speed)<6)this.autoCrawl=true;
    const crawl=this.low||this.autoCrawl;
    const transfer=crawl?3.2:1;
    if(crawl)this.gear=1;
    const coupledRpm=Math.abs(speed)/s.radius*ratios[this.gear-1]*s.final*transfer*60/(2*Math.PI);
    // Clutch slip lets the engine reach its torque band during a loaded hill start.
    this.rpm=clamp(Math.max(coupledRpm,850+throttle*1550),850,5600);
    if(!crawl&&!reversing&&coupledRpm>3900&&this.gear<5)this.gear++;else if(coupledRpm<1450&&this.gear>1)this.gear--;
    // Gameplay hill-start tuning; preserve catalog torque and taper the boost at road speeds.
    const pullingPower=1+ .65*clamp(1-Math.abs(speed)/14,0,1);
    const torque=s.torque*pullingPower*clamp(1-Math.pow((this.rpm-2800)/4200,2),.35,1);
    const force=torque*(reversing?3.5:ratios[this.gear-1])*s.final*transfer*.82/s.radius*throttle*(reversing?-1:1);
    const target=-input.steer*.52/(1+Math.abs(speed)*.035);this.steering+=(target-this.steering)*Math.min(1,dt*7);
    this.vehicle.setSteeringValue(this.steering,0);this.vehicle.setSteeringValue(this.steering,1);
    let rolling=0;
    const grip=this.vehicle.wheelInfos.map(w=>{const p=w.raycastResult.hasHit?w.raycastResult.hitPointWorld:w.chassisConnectionPointWorld;return SURFACES[surface(p.x,p.z)];});
    // Crawl traction assistance transfers available torque to loaded tires when an axle articulates.
    const assisted=this.four&&crawl;
    const totalCapacity=this.vehicle.wheelInfos.reduce((sum,w,i)=>sum+Math.max(0,w.suspensionForce)*grip[i].grip,0);
    this.surface=surface(this.body.position.x,this.body.position.z);
    for(let i=0;i<4;i++) {
      const wheel=this.vehicle.wheelInfos[i], driven=this.four||i>=2, axle=i<2?0:2;
      wheel.frictionSlip=grip[i].grip*(i<2?1: .96);
      // Open differential delivers the same axle torque limited by the less-loaded wheel.
      const mate=this.vehicle.wheelInfos[axle+(i%2===0?1:0)];
      const axleLimit=this.locked||assisted?Infinity:Math.min(wheel.suspensionForce*grip[i].grip,mate.suspensionForce*grip[axle+(i%2===0?1:0)].grip)+80;
      const load=Math.max(0,wheel.suspensionForce),mateLoad=Math.max(0,mate.suspensionForce);
      const share=this.locked&&load+mateLoad>0?load/(load+mateLoad):.5;
      const capacity=load*grip[i].grip;
      const demand=!driven?0:assisted&&totalCapacity>0?Math.abs(force)*capacity/totalCapacity:Math.abs(force)/(this.four?2:1)*share;
      this.slipping[i]=demand>capacity+100;
      const wheelForce=driven?Math.sign(force)*Math.min(demand,axleLimit,capacity):0;
      this.vehicle.applyEngineForce(wheelForce,i);
      const engineBrake=driven&&throttle<.05?s.mass*9.81*.018*transfer/4*dt:0;
      this.vehicle.setBrake((braking?s.mass*9.81*.75/4*dt:engineBrake)+(input.brake&&i>=2?s.mass*9.81*.6/2*dt:0),i);
      if(wheel.isInContact)rolling+=grip[i].resistance*load;
    }
    this.forward.scale(-Math.sign(speed)*Math.min(rolling,s.mass*Math.abs(speed)/dt),this.resistance);this.body.applyForce(this.resistance);
    this.world.step(dt);
    this.vehicle.wheelInfos.forEach((w,i)=>{if(this.slipping[i]){w.rotation-=Math.sign(force)*dt*(8+throttle*14);w.sliding=true;this.vehicle.sliding=true;}});
  }
  dispose(){this.vehicle.removeFromWorld(this.world);}
}



