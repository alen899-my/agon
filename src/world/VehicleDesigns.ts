import type { VehicleKind } from './Vehicles';

export type DetailedKind = Exclude<VehicleKind, 'f1' | 'nascar'>;
export type BodyFamily = 'fastback' | 'notchback' | 'wedge' | 'roadster' | 'wagon' | 'boxy' | 'pickup' | 'van' | 'bus' | 'truck';
export interface VehicleDesign {
  family: BodyFamily;
  /** Absolute heights and fractions of length measured from the nose. */
  roof: number; belt: number; cowl: number; roofFront: number; roofRear: number; rearGlass: number;
  nose: number; tail: number; roofWidth: number; waist: number;
  wheel: number; tire: number; rim: number; axleFront: number; axleRear: number;
  lights: 'oval' | 'round' | 'quad' | 'blade' | 'angular' | 'rect';
  grille: 'oval' | 'split' | 'wide' | 'slots' | 'closed';
  spokes: number; wing?: number; scoop?: boolean; midEngine?: boolean; fourDoor?: boolean;
  chrome?: boolean; spare?: boolean; rack?: boolean;
  equipment?: 'box' | 'rescue' | 'pumper' | 'ladder' | 'flatbed' | 'tow' | 'dump' | 'tank' | 'tractor';
}

const coupe: VehicleDesign = { family: 'fastback', roof: 1.34, belt: 0.90, cowl: 0.34,
  roofFront: 0.47, roofRear: 0.65, rearGlass: 0.82, nose: 0.64, tail: 0.83,
  roofWidth: 0.72, waist: 0.95, wheel: 0.34, tire: 0.27, rim: 0.73,
  axleFront: 0.20, axleRear: 0.79, lights: 'blade', grille: 'wide', spokes: 5 };
const sedan: VehicleDesign = { ...coupe, family: 'notchback', roof: 1.47, belt: 0.98,
  cowl: 0.29, roofFront: 0.41, roofRear: 0.69, rearGlass: 0.80, roofWidth: 0.79,
  nose: 0.77, tail: 0.94, wheel: 0.35, tire: 0.25, rim: 0.68, fourDoor: true };
const suv: VehicleDesign = { ...sedan, family: 'wagon', roof: 1.87, belt: 1.16,
  cowl: 0.27, roofFront: 0.36, roofRear: 0.89, rearGlass: 0.96, roofWidth: 0.86,
  nose: 1.02, tail: 1.12, wheel: 0.41, tire: 0.30, rim: 0.64, axleRear: 0.80 };
const van: VehicleDesign = { ...suv, family: 'van', roof: 2.45, belt: 1.26, cowl: 0.15,
  roofFront: 0.27, roofRear: 0.94, rearGlass: 0.98, roofWidth: 0.94, nose: 0.88,
  tail: 1.22, wheel: 0.39, tire: 0.26, rim: 0.61, axleFront: 0.19, axleRear: 0.79, lights: 'rect', spokes: 8 };
const truck: VehicleDesign = { ...van, family: 'truck', roof: 2.50, belt: 1.28, cowl: 0.10,
  roofFront: 0.16, roofRear: 0.31, rearGlass: 0.34, wheel: 0.47, tire: 0.32, rim: 0.62,
  axleFront: 0.17, axleRear: 0.79, fourDoor: false };

/** Each entry describes a separate silhouette and identifying design details.
 * Game footprints/handling remain in Vehicles.ts; these are render proportions.
 */
export const VEHICLE_DESIGNS: Record<DetailedKind, VehicleDesign> = {
  // Sports cars first: rear-engine arches, pony-car bonnet, wedges and open roadsters.
  sport: { ...coupe, lights: 'oval', grille: 'wide', roofFront: 0.43, roofRear: 0.62, rearGlass: 0.89, waist: 0.91, spokes: 10 },
  muscle: { ...coupe, family: 'notchback', cowl: 0.39, roofFront: 0.50, roofRear: 0.70, rearGlass: 0.82, roof: 1.40, belt: 0.98, nose: 0.83, tail: 0.96, lights: 'angular', scoop: true },
  super: { ...coupe, family: 'wedge', roof: 1.17, belt: 0.80, cowl: 0.27, roofFront: 0.43, roofRear: 0.62, rearGlass: 0.77, nose: 0.49, tail: 0.86, roofWidth: 0.66, waist: 0.91, lights: 'angular', midEngine: true, tire: 0.31, spokes: 5 },
  convertible: { ...coupe, family: 'roadster', cowl: 0.39, roofFront: 0.49, roofRear: 0.65, rearGlass: 0.71, roof: 1.23, belt: 0.82, nose: 0.58, tail: 0.78, lights: 'oval', grille: 'oval', wheel: 0.31, tire: 0.22, rim: 0.69 },
  hyper: { ...coupe, family: 'wedge', roof: 1.20, belt: 0.82, cowl: 0.25, roofFront: 0.43, roofRear: 0.60, rearGlass: 0.75, nose: 0.49, tail: 0.88, roofWidth: 0.64, waist: 0.90, wheel: 0.35, tire: 0.33, midEngine: true, wing: 0.36, lights: 'blade', spokes: 7 },
  track: { ...coupe, roofFront: 0.43, roofRear: 0.62, rearGlass: 0.89, lights: 'oval', waist: 0.90, tire: 0.31, wing: 0.44, spokes: 10 },
  rally: { ...sedan, roof: 1.43, belt: 0.96, nose: 0.80, lights: 'angular', scoop: true, wing: 0.29, tire: 0.27, rim: 0.66, spokes: 10 },
  drift: { ...coupe, family: 'notchback', roof: 1.28, cowl: 0.36, roofFront: 0.48, roofRear: 0.68, rearGlass: 0.79, nose: 0.68, tail: 0.86, lights: 'blade', wing: 0.24, waist: 0.94, spokes: 6 },
  classic: { ...coupe, roof: 1.22, belt: 0.80, cowl: 0.46, roofFront: 0.57, roofRear: 0.69, rearGlass: 0.91, nose: 0.56, tail: 0.69, roofWidth: 0.67, waist: 0.87, wheel: 0.32, tire: 0.21, rim: 0.60, lights: 'oval', grille: 'oval', chrome: true, spokes: 30 },
  egt: { ...sedan, family: 'fastback', roof: 1.37, belt: 0.92, roofRear: 0.66, rearGlass: 0.88, nose: 0.66, tail: 0.83, roofWidth: 0.73, lights: 'blade', grille: 'closed', wheel: 0.35, tire: 0.28, rim: 0.77, spokes: 5 },
  coupe: { ...coupe, family: 'notchback', cowl: 0.36, roofFront: 0.48, roofRear: 0.69, rearGlass: 0.80, roof: 1.38, lights: 'quad', grille: 'split', spokes: 10 },
  car: { ...sedan, spokes: 10 },
  hatch: { ...sedan, family: 'wagon', roof: 1.46, roofRear: 0.82, rearGlass: 0.96, cowl: 0.27, roofFront: 0.39, lights: 'angular', axleRear: 0.80 },
  taxi: { ...sedan, roof: 1.51, nose: 0.85, roofRear: 0.67, cowl: 0.32, roofFront: 0.43, lights: 'rect', grille: 'wide', chrome: true, rim: 0.59, spokes: 12 },
  police: { ...sedan, roof: 1.45, cowl: 0.33, roofFront: 0.44, roofRear: 0.67, lights: 'angular', nose: 0.81, tire: 0.28, spokes: 8 },
  wagon: { ...sedan, family: 'wagon', roof: 1.49, roofRear: 0.85, rearGlass: 0.95, nose: 0.78, lights: 'blade', rack: true, tire: 0.28, spokes: 10 },
  limo: { ...sedan, cowl: 0.23, roofFront: 0.32, roofRear: 0.77, rearGlass: 0.86, roof: 1.52, lights: 'rect', chrome: true, axleFront: 0.15, axleRear: 0.85, spokes: 15 },
  compact: { ...sedan, family: 'wagon', roof: 1.44, cowl: 0.27, roofFront: 0.36, roofRear: 0.85, rearGlass: 0.95, nose: 0.75, lights: 'round', grille: 'oval', roofWidth: 0.85, wheel: 0.31, tire: 0.22, chrome: true },
  esedan: { ...sedan, family: 'fastback', roof: 1.43, roofRear: 0.66, rearGlass: 0.86, nose: 0.68, lights: 'blade', grille: 'closed', spokes: 5, rim: 0.74 },
  suv: { ...suv, lights: 'blade', grille: 'wide', spokes: 10, rack: true },
  jeep: { ...suv, family: 'boxy', roof: 1.86, cowl: 0.31, roofFront: 0.34, roofRear: 0.92, roofWidth: 0.90, nose: 1.12, lights: 'round', grille: 'slots', rim: 0.55, spare: true },
  gwagen: { ...suv, family: 'boxy', roof: 1.94, cowl: 0.31, roofFront: 0.35, roofRear: 0.91, roofWidth: 0.90, nose: 1.10, lights: 'round', grille: 'slots', spare: true, spokes: 10 },
  crossover: { ...suv, roof: 1.69, belt: 1.06, nose: 0.90, wheel: 0.37, tire: 0.26, roofRear: 0.83, lights: 'angular', spokes: 5 },
  hummer: { ...suv, family: 'boxy', roof: 1.96, belt: 1.23, nose: 1.17, cowl: 0.29, roofFront: 0.34, roofWidth: 0.91, wheel: 0.44, tire: 0.34, lights: 'blade', grille: 'slots', rim: 0.57 },
  cruiser: { ...suv, roof: 1.93, belt: 1.19, nose: 1.10, cowl: 0.30, lights: 'rect', rack: true, grille: 'wide', rim: 0.59 },
  buggy: { ...coupe, family: 'roadster', roof: 1.36, belt: 0.86, cowl: 0.34, roofFront: 0.42, roofRear: 0.66, rearGlass: 0.74, wheel: 0.39, tire: 0.32, rim: 0.52, lights: 'round', grille: 'closed', waist: 0.84 },
  pickup: { ...suv, family: 'pickup', roof: 1.88, cowl: 0.28, roofFront: 0.36, roofRear: 0.57, rearGlass: 0.59, nose: 1.06, lights: 'rect', axleRear: 0.79 },
  raptor: { ...suv, family: 'pickup', roof: 1.96, belt: 1.20, cowl: 0.28, roofFront: 0.37, roofRear: 0.58, rearGlass: 0.60, nose: 1.10, wheel: 0.44, tire: 0.34, rim: 0.56, lights: 'angular', waist: 0.95 },
  van: { ...van },
  minivan: { ...van, roof: 1.82, belt: 1.09, nose: 0.80, cowl: 0.22, roofFront: 0.35, roofRear: 0.88, roofWidth: 0.85, wheel: 0.35, lights: 'blade', rim: 0.70 },
  camper: { ...van, roof: 2.50, cowl: 0.17, roofFront: 0.29, chrome: true, rack: true },
  shuttle: { ...van, roof: 2.37, lights: 'angular', cowl: 0.17, roofFront: 0.28 },
  minibus: { ...van, roof: 2.40, cowl: 0.18, roofFront: 0.29, wheel: 0.42 },
  stepvan: { ...van, roof: 2.55, cowl: 0.08, roofFront: 0.11, roofWidth: 0.96, lights: 'round' },
  bus: { ...van, family: 'bus', roof: 2.75, belt: 1.22, cowl: 0.015, roofFront: 0.045, roofRear: 0.97, rearGlass: 0.99, roofWidth: 0.97, wheel: 0.48, tire: 0.32, axleFront: 0.21, axleRear: 0.78 },
  coach: { ...van, family: 'bus', roof: 2.95, belt: 1.40, cowl: 0.015, roofFront: 0.07, roofRear: 0.95, rearGlass: 0.99, roofWidth: 0.95, wheel: 0.49, tire: 0.33, lights: 'blade', axleFront: 0.20, axleRear: 0.77 },
  patrol: { ...suv, roof: 1.84, lights: 'rect', nose: 1.05 },
  ambulance: { ...truck, cowl: 0.18, roofFront: 0.25, roofRear: 0.37, rearGlass: 0.39, equipment: 'rescue' },
  fire: { ...truck, roof: 2.62, cowl: 0.015, roofFront: 0.045, roofRear: 0.34, rearGlass: 0.36, equipment: 'pumper' },
  ladder: { ...truck, roof: 2.65, cowl: 0.015, roofFront: 0.045, roofRear: 0.34, rearGlass: 0.36, equipment: 'ladder' },
  boxTruck: { ...truck, equipment: 'box' },
  semi: { ...truck, roof: 2.65, cowl: 0.25, roofFront: 0.29, roofRear: 0.48, rearGlass: 0.50, nose: 1.18, lights: 'round', chrome: true, equipment: 'tractor' },
  flatbed: { ...truck, equipment: 'flatbed' },
  towtruck: { ...truck, cowl: 0.19, roofFront: 0.25, roofRear: 0.40, rearGlass: 0.42, equipment: 'tow' },
  dump: { ...truck, roof: 2.57, equipment: 'dump', wheel: 0.49, tire: 0.37, rim: 0.55 },
  tanker: { ...truck, equipment: 'tank' },
};
