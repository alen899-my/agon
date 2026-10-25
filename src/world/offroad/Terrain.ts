/** Metres, Y-up. Rendering, suspension and walking share this deterministic field. */
export const CHUNK = 128;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
export function hash(x: number, z: number): number { const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return n - Math.floor(n); }
function noise(x:number,z:number):number {
  const ix=Math.floor(x),iz=Math.floor(z);let u=x-ix,v=z-iz;
  u=u*u*(3-2*u);v=v*v*(3-2*v);
  return (hash(ix,iz)*(1-u)+hash(ix+1,iz)*u)*(1-v)+(hash(ix,iz+1)*(1-u)+hash(ix+1,iz+1)*u)*v;
}
export function trailX(z:number,route=0):number {
  return route===0?65*Math.sin(z/240)+28*Math.sin(z/93):240+110*Math.sin(z/360+.4);
}
function routeDistance(x:number,z:number,route:number):number {
  const slope=(trailX(z+1,route)-trailX(z-1,route))/2;
  return Math.abs(x-trailX(z,route))/Math.sqrt(1+slope*slope);
}
export const JUNCTION_Z=420;
export function connectorDistance(x:number,z:number):number {
  return Math.hypot(Math.max(trailX(JUNCTION_Z)-x,0,x-trailX(JUNCTION_Z,1)),z-JUNCTION_Z);
}
export function trailDistance(x:number,z:number):number {return Math.min(routeDistance(x,z,0),routeDistance(x,z,1),connectorDistance(x,z));}
/** Authored route grades, independent of high-frequency terrain noise. */
function profile(z:number,route:number):number {
  const t=Math.max(0,z);
  const valley=22+115*(1-Math.exp(-t/2600))+14*Math.sin(t/520)+7*Math.sin(t/230);
  const ridge=route===1?65*smooth(80,1250,t)+8*Math.sin(t/450)*smooth(100,500,t):0;
  return (valley+ridge)*smooth(0,420,t);
}
function roadHeight(z:number,route:number):number {
  const base=profile(z,route);
  // A shallow, level ford with gradual banks; no water sheet cutting through a steep road.
  return route===0?base+(profile(185,0)-base)*(1-smooth(5,18,Math.abs(z-185))):base;
}
export function height(x:number,z:number):number {
  if(z<=0)return 0;
  const h0=roadHeight(z,0),h1=roadHeight(z,1),d0=routeDistance(x,z,0),d1=routeDistance(x,z,1);
  const basin=1-Math.exp(-Math.pow((x-25*Math.sin(z/300))/280,2));
  const ridge=135*noise(x/780+9,z/780+3)+75*noise(x/1600-2,z/1600+8);
  const detail=(noise(x/55,z/55)-.5)*5+(noise(x/15,z/15)-.5)*.65;
  const natural=h0+(ridge*basin+detail)*smooth(0,650,z);
  const d=Math.min(d0,d1),w0=1-smooth(5.5,65,d0),w1=1-smooth(5.5,65,d1),weight=w0+w1;
  // Wide graded shoulders connect the road to the hillside instead of narrow vertical cuts.
  let y=weight>0?natural+((h0*w0+h1*w1)/weight-natural)*Math.min(1,weight):natural;
  const link=connectorDistance(x,z),t=clamp((x-trailX(JUNCTION_Z))/(trailX(JUNCTION_Z,1)-trailX(JUNCTION_Z)),0,1);
  // Match both longitudinal roads throughout the junction blend, not just at one point.
  const linkHeight=h0+(h1-h0)*smooth(0,1,t);
  y+=(linkHeight-y)*(1-smooth(5.5,38,link));
  const rut=(1-smooth(3,5,d))*Math.pow(Math.sin(z/21),2)*.055;
  // Basalt ribs are part of the heightfield: rounded approaches, matching visuals/collision,
  // and a clear outside line for lower-clearance vehicles.
  const technical=.18*Math.pow(Math.sin((z-710)*Math.PI/9),4)*smooth(704,716,z)*(1-smooth(780,796,z))*(1-smooth(1.8,3.2,d1));
  return Math.max(0,y-rut+technical);
}
export type Surface='dirt'|'gravel'|'mud'|'rock'|'water';
export const SURFACES:Record<Surface,{grip:number;resistance:number;color:number}>={
  dirt:{grip:1.35,resistance:.025,color:0x89765b},gravel:{grip:.95,resistance:.045,color:0x999485},
  mud:{grip:.5,resistance:.13,color:0x514334},rock:{grip:1.65,resistance:.025,color:0x787b74},water:{grip:.65,resistance:.10,color:0x536b65},
};
export function surface(x:number,z:number):Surface {
  if(Math.abs(z-185)<5&&routeDistance(x,z,0)<5)return 'water';
  if(z>704&&z<796&&routeDistance(x,z,1)<4)return 'rock';
  if(trailDistance(x,z)<5.5)return z<280?'dirt':Math.sin(z/75)>.84?'mud':Math.sin(z/150)<-.25?'gravel':'dirt';
  return height(x,z)>150||noise(x/40,z/40)>.65?'rock':'dirt';
}
export const LANDMARKS=[
  {name:'Valley basecamp',x:trailX(0),z:0,difficulty:'Easy'},
  {name:'Monsoon ford',x:trailX(185),z:185,difficulty:'Moderate'},
  {name:'Forest junction',x:trailX(420),z:420,difficulty:'Moderate'},
  {name:'Basalt staircase',x:trailX(740,1),z:740,difficulty:'Technical'},
  {name:'High ridge pass',x:trailX(1600,1),z:1600,difficulty:'Expert'},
];
