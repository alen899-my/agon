export interface VehicleSpec {
  name: string;
  inspiredBy: string;
  category: 'car' | 'sport' | 'suv' | 'truck' | 'van' | 'service' | 'bus';
  length: number;
  width: number;
  height: number;
  topSpeed: number;
  acceleration: number;
  grip: number;
  blurb: string;
}

export const VEHICLES = {
  car: { name: 'Sedan', inspiredBy: 'Toyota Camry', category: 'car', length: 4.3, width: 1.9, height: 0.75, topSpeed: 32, acceleration: 7, grip: 8, blurb: 'Everyday 4-door family sedan' },
  hatch: { name: 'Hatchback', inspiredBy: 'VW Golf GTI', category: 'car', length: 4.0, width: 1.85, height: 0.8, topSpeed: 33, acceleration: 7.5, grip: 8.5, blurb: 'Nimble 5-door hot hatch' },
  taxi: { name: 'Taxi', inspiredBy: 'Crown Vic cab', category: 'car', length: 4.5, width: 1.9, height: 0.8, topSpeed: 33, acceleration: 7.2, grip: 8, blurb: 'City yellow cab, always on shift' },
  police: { name: 'Interceptor', inspiredBy: 'Dodge Charger Pursuit', category: 'service', length: 4.6, width: 1.95, height: 0.78, topSpeed: 44, acceleration: 9.5, grip: 8.8, blurb: 'Police pursuit cruiser' },
  sport: { name: 'Sport coupe', inspiredBy: 'Porsche 911', category: 'sport', length: 4.2, width: 1.9, height: 0.6, topSpeed: 46, acceleration: 10, grip: 9, blurb: 'Rear-engine track coupe' },
  muscle: { name: 'Muscle', inspiredBy: 'Ford Mustang', category: 'sport', length: 4.5, width: 1.95, height: 0.72, topSpeed: 42, acceleration: 9, grip: 7.5, blurb: 'V8 American muscle' },
  super: { name: 'Supercar', inspiredBy: 'Lamborghini Huracan', category: 'sport', length: 4.4, width: 2.0, height: 0.55, topSpeed: 52, acceleration: 12, grip: 9.5, blurb: 'Mid-engine exotic, fastest in town' },
  convertible: { name: 'Roadster', inspiredBy: 'Mazda MX-5 Miata', category: 'sport', length: 3.9, width: 1.8, height: 0.55, topSpeed: 36, acceleration: 8, grip: 8.6, blurb: 'Open-top weekend roadster' },
  suv: { name: 'SUV', inspiredBy: 'Range Rover', category: 'suv', length: 5, width: 2.0, height: 1.2, topSpeed: 30, acceleration: 6, grip: 7, blurb: 'Tall luxury 4x4 wagon' },
  pickup: { name: 'Pickup', inspiredBy: 'Ford F-150', category: 'truck', length: 5.6, width: 2.0, height: 1.1, topSpeed: 29, acceleration: 5.5, grip: 6, blurb: 'Crew-cab work pickup' },
  van: { name: 'Cargo van', inspiredBy: 'Ford Transit', category: 'van', length: 5.8, width: 2.0, height: 1.4, topSpeed: 25, acceleration: 4.5, grip: 7, blurb: 'High-roof delivery van' },
  minivan: { name: 'Minivan', inspiredBy: 'Toyota Sienna', category: 'van', length: 5.2, width: 1.95, height: 1.15, topSpeed: 28, acceleration: 5.8, grip: 7.2, blurb: 'Sliding-door family hauler' },
  ambulance: { name: 'Ambulance', inspiredBy: 'Type III rescue rig', category: 'service', length: 6.2, width: 2.05, height: 1.6, topSpeed: 30, acceleration: 5, grip: 6.5, blurb: 'Emergency medical rig' },
  fire: { name: 'Fire engine', inspiredBy: 'Pierce pumper', category: 'service', length: 7.2, width: 2.2, height: 1.7, topSpeed: 26, acceleration: 4, grip: 6, blurb: 'Ladder pumper truck' },
  boxTruck: { name: 'Box truck', inspiredBy: 'Isuzu box lorry', category: 'truck', length: 6.8, width: 2.15, height: 1.75, topSpeed: 24, acceleration: 3.8, grip: 6.2, blurb: 'City delivery box truck' },
  bus: { name: 'City bus', inspiredBy: 'New Flyer transit bus', category: 'bus', length: 8, width: 2.2, height: 1.8, topSpeed: 22, acceleration: 3, grip: 6, blurb: 'Full-size transit bus' },
} as const satisfies Record<string, VehicleSpec>;
export type VehicleKind = keyof typeof VEHICLES;
export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];
