/** Continuous north passage from Darkwood Loop into the Ghats. */
export const MOUNTAIN_ORIGIN = { x: -510, z: -640 };
export const MOUNTAIN_ACCESS = [{x:-510,z:-108},{x:-510,z:-640}];
export function onMountain(x:number,z:number):boolean { return z<=-512; }
export function onMountainPassage(x:number,z:number,half=8):boolean { return z<=-100 && z>=-640 && Math.abs(x+510)<half; }
export function mountainLocal(x:number,z:number){return {x:-x-510,z:-z-640};}
export function mountainWorld(x:number,z:number){return {x:-510-x,z:-640-z};}
export function mountainClearing(x:number,z:number){return Math.abs(x+510)<13&&z< -98;}
