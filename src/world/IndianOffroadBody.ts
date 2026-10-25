import * as THREE from 'three';
import { VehicleMeshBuilder } from './VehicleMeshBuilder';
/** Distinct production-inspired body treatments, merged into the standard factory meshes. */
export function addIndianOffroadBody(p:VehicleMeshBuilder,kind:string,L:number,W:number,roof:number,axles:number[],radius:number) {
  if(!['gypsy','thar','pajero'].includes(kind))return;
  const V=(x:number,y:number,z:number)=>new THREE.Vector3(x,y,z),hw=W/2,front=-L/2;
  const gypsy=kind==='gypsy',thar=kind==='thar';
  // Broad flat Thar fenders, narrow stamped Gypsy lips, sculpted Pajero cladding.
  for(const side of [-1,1])for(const axle of axles){
    const arch=radius+.075,flare=thar?.16:gypsy?.035:.09;
    p.surface(gypsy?'paint':'trim',(u,v)=>{
      const a=Math.PI*u;
      return V(side*(hw-.055+v*flare),radius+.08+Math.sin(a)*(arch+(thar?.07:.04)*v),axle-Math.cos(a)*(arch+(thar?.07:.04)*v));
    },36,6,side<0);
    if(thar)p.box('trim',side*(hw-.025),radius*2+.14,axle,.24,.075,.72);
  }
  if(gypsy){
    // Gypsy King: narrow pressed-steel bonnet, upright windshield, canvas rear canopy.
    p.box('trim',0,.82,front-.04,W*.68,.25,.045);
    for(let i=0;i<5;i++)p.box('alloy',0,.73+i*.045,front-.07,W*.43,.014,.014);
    p.box('frontBumper',0,.39,front-.10,W+.035,.14,.16);
    for(const side of [-1,1]){
      p.box('signal',side*W*.33,.54,front-.11,.12,.065,.025);
      p.box('trim',side*(hw-.04),roof-.29,L*.33,.035,.40,.68);
      p.box('glass',side*(hw-.019),roof-.29,L*.33,.012,.30,.53);
      for(const z of [L*.12,L*.27,L*.43])p.box('alloy',side*(hw-.025),1.07,z,.025,.035,.045);
      p.tube('trim',[V(side*(hw-.08),roof-.02,L*.02),V(side*(hw-.08),roof+.01,L*.41)],.018);
    }
    p.box('trim',0,roof-.3,L/2+.025,W*.84,.5,.025);
    p.box('glass',0,roof-.29,L/2+.041,W*.53,.30,.01);
  }else if(thar){
    // Three-door Thar: wide separate fenders, exposed hinges and deep bumper pods.
    p.box('frontBumper',0,.47,front-.13,W*.96,.25,.28);
    p.box('alloy',0,.36,front-.28,W*.44,.11,.035);
    for(const side of [-1,1]){
      p.box('trim',side*W*.36,.48,front-.29,.28,.16,.035);
      p.add('head',new THREE.CylinderGeometry(.06,.06,.026,20),V(side*W*.36,.48,front-.31),new THREE.Euler(Math.PI/2,0,0));
      p.box('signal',side*(hw-.07),1.02,front+.13,.16,.045,.05);
      for(const y of [.64,.95])p.box('alloy',side*(hw-.015),y,-.46,.035,.055,.13);
      p.box('trim',side*(hw-.025),1.47,.98,.075,.56,1.20);
      p.box('glass',side*(hw+.015),1.48,.98,.015,.42,.91);
      p.box('brake',side*W*.39,.93,L/2+.035,.19,.29,.06);
      p.box('trim',side*W*.39,.93,L/2+.071,.13,.20,.012);
    }
  }else{
    // Pajero five-door: long greenhouse, rectangular lamps, two-tone lower cladding.
    p.box('alloy',0,.91,front-.04,W*.44,.22,.045);
    for(const y of [.83,.91,.99])p.box('trim',0,y,front-.068,W*.38,.025,.015);
    p.box('frontBumper',0,.48,front-.075,W*.98,.29,.18);
    for(const side of [-1,1]){
      p.box('alloy',side*(hw-.025),.48,0,.065,.30,L*.88);
      p.box('trim',side*(hw+.015),.29,.15,.15,.09,L*.48);
      p.box('head',side*W*.34,1.0,front-.06,.34,.19,.045);
      p.box('signal',side*W*.44,.99,front-.075,.075,.15,.025);
      for(const z of [-.46,.63]){
        p.box('trim',side*(hw-.01),1.04,z,.026,.025,.15);
        p.tube('trim',[V(side*(hw-.025),.64,z+.2),V(side*(hw-.025),1.12,z+.2)],.005);
      }
      p.box('brake',side*W*.43,1.10,L/2+.025,.14,.39,.045);
    }
  }
}
