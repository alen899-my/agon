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
  /** Cabin/glass length override (tall rigs, stretch limos, tiny buggies). */
  cab?: number;
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
  // --- Wave 2: track toys, off-roaders, workhorses (same boxes, new attitudes) ---
  hyper: { name: 'Hypercar', inspiredBy: 'Koenigsegg Jesko', category: 'sport', length: 4.6, width: 2.0, height: 0.5, topSpeed: 55, acceleration: 13, grip: 9.8, blurb: '1,600-hp apex predator' },
  track: { name: 'Track GT', inspiredBy: 'Porsche 911 GT3 RS', category: 'sport', length: 4.3, width: 1.95, height: 0.62, topSpeed: 48, acceleration: 11, grip: 9.6, blurb: 'Winged circuit scalpel' },
  rally: { name: 'Rally', inspiredBy: 'Subaru WRX STI', category: 'sport', length: 4.2, width: 1.9, height: 0.75, topSpeed: 40, acceleration: 9.5, grip: 8.2, blurb: 'Gravel-ready turbo sedan' },
  drift: { name: 'Drift missile', inspiredBy: 'Nissan Silvia S15', category: 'sport', length: 4.4, width: 1.95, height: 0.68, topSpeed: 43, acceleration: 9.2, grip: 7.0, blurb: 'Sideways Tokyo legend' },
  classic: { name: 'Classic', inspiredBy: 'Jaguar E-Type', category: 'sport', length: 4.1, width: 1.85, height: 0.65, topSpeed: 38, acceleration: 8, grip: 8.2, blurb: 'Sixties chrome icon' },
  egt: { name: 'Electric GT', inspiredBy: 'Porsche Taycan', category: 'sport', length: 4.6, width: 1.95, height: 0.62, topSpeed: 50, acceleration: 12.5, grip: 9.2, blurb: 'Silent instant torque' },
  coupe: { name: 'Coupe', inspiredBy: 'BMW M4', category: 'car', length: 4.4, width: 1.9, height: 0.68, topSpeed: 41, acceleration: 9, grip: 8.8, blurb: 'Two-door autobahn runner' },
  wagon: { name: 'Wagon', inspiredBy: 'Audi RS6 Avant', category: 'car', length: 4.6, width: 1.9, height: 0.85, topSpeed: 36, acceleration: 8, grip: 8.2, blurb: 'Long-roof sleeper' },
  limo: { name: 'Limo', inspiredBy: 'Stretch limousine', category: 'car', length: 6.4, width: 1.95, height: 0.8, topSpeed: 34, acceleration: 7, grip: 7.5, blurb: 'Chauffeured stretch', cab: 3.4 },
  compact: { name: 'Compact', inspiredBy: 'Mini Cooper', category: 'car', length: 3.6, width: 1.75, height: 0.85, topSpeed: 31, acceleration: 7.5, grip: 9, blurb: 'Nimble city flea' },
  esedan: { name: 'E-Sedan', inspiredBy: 'Tesla Model 3', category: 'car', length: 4.5, width: 1.9, height: 0.7, topSpeed: 44, acceleration: 11, grip: 9, blurb: 'Flush electric sedan' },
  jeep: { name: 'Jeep', inspiredBy: 'Jeep Wrangler', category: 'suv', length: 4.4, width: 1.95, height: 1.15, topSpeed: 30, acceleration: 6.5, grip: 6.8, blurb: 'Trail-rated 4x4' },
  gwagen: { name: 'G-Wagen', inspiredBy: 'Mercedes G63', category: 'suv', length: 4.8, width: 2.0, height: 1.25, topSpeed: 32, acceleration: 6.8, grip: 7, blurb: 'Boxy luxury brute' },
  crossover: { name: 'Crossover', inspiredBy: 'Toyota RAV4', category: 'suv', length: 4.5, width: 1.9, height: 1.0, topSpeed: 32, acceleration: 7, grip: 7.8, blurb: 'Suburban all-rounder' },
  hummer: { name: 'Hummer EV', inspiredBy: 'Hummer EV', category: 'suv', length: 5.2, width: 2.1, height: 1.3, topSpeed: 31, acceleration: 6.2, grip: 6.5, blurb: 'Electric supertruck' },
  cruiser: { name: 'Land Cruiser', inspiredBy: 'Toyota Land Cruiser', category: 'suv', length: 5.0, width: 2.0, height: 1.25, topSpeed: 30, acceleration: 6.4, grip: 6.8, blurb: 'Expedition workhorse' },
  buggy: { name: 'Dune buggy', inspiredBy: 'Meyers Manx', category: 'suv', length: 3.6, width: 1.9, height: 0.7, topSpeed: 33, acceleration: 8, grip: 7, blurb: 'Open-air sand hopper', cab: 1.6 },
  semi: { name: 'Semi', inspiredBy: 'Peterbilt 389', category: 'truck', length: 6.4, width: 2.2, height: 1.7, topSpeed: 27, acceleration: 4.5, grip: 6.2, blurb: 'Long-haul tractor', cab: 2.0 },
  flatbed: { name: 'Flatbed', inspiredBy: 'Rollback carrier', category: 'truck', length: 6.6, width: 2.15, height: 1.3, topSpeed: 26, acceleration: 4.2, grip: 6.2, blurb: 'Open-deck hauler', cab: 2.0 },
  towtruck: { name: 'Tow truck', inspiredBy: 'Jerr-Dan wrecker', category: 'truck', length: 6.0, width: 2.1, height: 1.5, topSpeed: 28, acceleration: 5, grip: 6.5, blurb: 'Heavy wrecker', cab: 2.0 },
  dump: { name: 'Dump truck', inspiredBy: 'Caterpillar 770', category: 'truck', length: 6.2, width: 2.15, height: 1.6, topSpeed: 25, acceleration: 4, grip: 6, blurb: 'Quarry tipper', cab: 2.0 },
  tanker: { name: 'Tanker', inspiredBy: 'Fuel tanker', category: 'truck', length: 6.8, width: 2.15, height: 1.7, topSpeed: 24, acceleration: 3.8, grip: 6, blurb: 'Liquid cargo rig', cab: 1.8 },
  raptor: { name: 'Raptor', inspiredBy: 'Ford Raptor', category: 'truck', length: 5.7, width: 2.05, height: 1.2, topSpeed: 32, acceleration: 6.5, grip: 6.5, blurb: 'Desert-runner pickup' },
  camper: { name: 'Camper', inspiredBy: 'Airstream Interstate', category: 'van', length: 5.6, width: 2.0, height: 1.5, topSpeed: 26, acceleration: 4.5, grip: 6.8, blurb: 'Home on wheels' },
  shuttle: { name: 'Shuttle', inspiredBy: 'Mercedes Sprinter', category: 'van', length: 5.4, width: 2.0, height: 1.3, topSpeed: 28, acceleration: 5.5, grip: 7, blurb: 'Airport shuttle van' },
  stepvan: { name: 'Step van', inspiredBy: 'Grumman Olson', category: 'van', length: 5.8, width: 2.05, height: 1.55, topSpeed: 25, acceleration: 4.2, grip: 6.5, blurb: 'Ice-cream truck classic' },
  patrol: { name: 'Patrol SUV', inspiredBy: 'Police Tahoe', category: 'service', length: 4.8, width: 2.0, height: 0.95, topSpeed: 42, acceleration: 9, grip: 8.5, blurb: 'K-9 pursuit SUV' },
  ladder: { name: 'Ladder truck', inspiredBy: 'Seagrave aerial', category: 'service', length: 7.4, width: 2.2, height: 1.75, topSpeed: 25, acceleration: 3.8, grip: 5.8, blurb: 'Aerial ladder rig' },
  coach: { name: 'Coach', inspiredBy: 'Setra touring coach', category: 'bus', length: 9.0, width: 2.25, height: 1.9, topSpeed: 24, acceleration: 3.2, grip: 6, blurb: 'Touring motorcoach' },
  minibus: { name: 'Minibus', inspiredBy: 'Ford Transit bus', category: 'bus', length: 6.0, width: 2.1, height: 1.6, topSpeed: 26, acceleration: 4.5, grip: 6.5, blurb: 'Neighborhood shuttle' },
} as const satisfies Record<string, VehicleSpec>;
export type VehicleKind = keyof typeof VEHICLES;
export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];

export type WheelStyle = 'sport' | 'touring' | 'offroad' | 'steel' | 'dually';

/** Factory paint palettes: first entry = signature/hero color, rest = traffic variety.
 *  Service/livery kinds stay fixed (taxi yellow, police, fire, ambulance). */
export const VEHICLE_PAINTS: Record<VehicleKind, number[]> = {
  car: [0xd8dce2, 0x1c1e22, 0xf5f5f5, 0x8a0f1a, 0x2456c8, 0x2f4a3c, 0x8a8f96],
  hatch: [0xc23b2e, 0x2456c8, 0xf5f5f5, 0x1c1e22, 0xf2b705, 0x2f8f5b, 0x8a8f96],
  taxi: [0xf2b705],
  police: [0xe8ecf1],
  sport: [0xd21f26, 0xf2b705, 0x2456c8, 0x1c1e22, 0xf5f5f5, 0x0fa968],
  muscle: [0x2456c8, 0xd21f26, 0x1c1e22, 0xe86a1c, 0x2f4a3c, 0xf5f5f5],
  super: [0xff6a00, 0xf2d205, 0x0fa968, 0xd21f26, 0x1c1e22, 0xcfe8f5],
  convertible: [0xb3122e, 0x2456c8, 0x1c1e22, 0xf5f5f5, 0x0fa968, 0xe86a1c],
  suv: [0x2f4a3c, 0x1c1e22, 0xf5f5f5, 0x8a8f96, 0x5a2d2d, 0x2456c8],
  pickup: [0x2e5fa3, 0x1c1e22, 0xf5f5f5, 0x8a0f1a, 0x8a8f96, 0x2f4a3c],
  van: [0xe4e4e4, 0xf5f5f5, 0x2456c8, 0x8a8f96, 0xc23b2e, 0x2f4a3c],
  minivan: [0x9aa5b1, 0x1c1e22, 0x5a2d2d, 0x2f4a3c, 0xf5f5f5, 0x2456c8],
  ambulance: [0xf2f2f2],
  fire: [0xc01515],
  boxTruck: [0xe8e8e8, 0xf5f5f5, 0x2456c8, 0xf2b705, 0xc23b2e],
  bus: [0x2b7fc4, 0x0fa968, 0xe86a1c, 0xc23b2e, 0xe4e4e4],
  hyper: [0x111318, 0x2b5fc7, 0xe86a1c, 0xf5f5f5, 0x5a2d8a],
  track: [0x0fa968, 0xf5f5f5, 0x1c1e22, 0xf2b705, 0xd21f26],
  rally: [0x2b5fc7, 0xf5f5f5, 0xc23b2e, 0x1c1e22, 0xf2b705],
  drift: [0x5a5f8a, 0x0fa968, 0xf5f5f5, 0x1c1e22, 0xd21f26],
  classic: [0x0d5c34, 0x8a0f1a, 0xcfe8f5, 0x1c1e22, 0xb08945],
  egt: [0xcfe8f5, 0x8a8f96, 0x1c1e22, 0x2456c8, 0x5a2d2d],
  coupe: [0x2244cc, 0x1c1e22, 0xf5f5f5, 0xd21f26, 0x2f4a3c],
  wagon: [0x5a6268, 0x1c1e22, 0x2456c8, 0x8a0f1a, 0xf5f5f5],
  limo: [0x0a0a0c, 0xf5f5f5, 0x1c1e22],
  compact: [0xd23b3b, 0x2456c8, 0xf5f5f5, 0x1c1e22, 0x0fa968, 0xf2b705],
  esedan: [0xe8ecf1, 0x1c1e22, 0x5a6268, 0x8a0f1a, 0x2456c8],
  jeep: [0x4a6b2f, 0x1c1e22, 0xb08945, 0xc23b2e, 0xf5f5f5],
  gwagen: [0x0c0c0e, 0xf5f5f5, 0x8a8f96, 0x2f4a3c],
  crossover: [0x7a8a99, 0x8a0f1a, 0x2456c8, 0x1c1e22, 0xf5f5f5, 0x2f4a3c],
  hummer: [0xd8d4c8, 0x1c1e22, 0x2f4a3c, 0x8a8f96],
  cruiser: [0xb08945, 0xf5f5f5, 0x1c1e22, 0x2f4a3c, 0x8a0f1a],
  buggy: [0xe86a1c, 0x2456c8, 0xf2d205, 0x0fa968, 0xc23b2e],
  semi: [0x8a0f1a, 0x2456c8, 0x1c1e22, 0x0fa968, 0xe86a1c],
  flatbed: [0x2e5fa3, 0xc23b2e, 0xf2b705, 0x1c1e22],
  towtruck: [0xe8a90c, 0xc23b2e, 0x1c1e22],
  dump: [0xd7a821, 0xc23b2e, 0x0fa968, 0x1c1e22],
  tanker: [0xd8dce2, 0xf5f5f5, 0x2456c8],
  raptor: [0x707880, 0x1c1e22, 0x2456c8, 0xc23b2e],
  camper: [0xe4e4e4, 0x2f4a3c, 0x2456c8, 0xb08945],
  shuttle: [0xd8dce2, 0xf5f5f5, 0x2b7fc4],
  stepvan: [0xf2f2f2, 0xe86a1c, 0x2b7fc4, 0xc23b2e],
  patrol: [0x14181f],
  ladder: [0xc01515],
  coach: [0x7a1f2b, 0xe4e4e4, 0x2b7fc4, 0x1c1e22],
  minibus: [0xd97b29, 0xe4e4e4, 0x2b7fc4, 0xf5f5f5],
};

/** Distinct rim/tire treatment per model so wheels stop looking cloned. */
export const VEHICLE_WHEELS: Record<VehicleKind, WheelStyle> = {
  car: 'touring', hatch: 'touring', taxi: 'steel', police: 'steel',
  sport: 'sport', muscle: 'sport', super: 'sport', convertible: 'sport',
  suv: 'offroad', pickup: 'offroad', van: 'steel', minivan: 'touring',
  ambulance: 'steel', fire: 'dually', boxTruck: 'dually', bus: 'dually',
  hyper: 'sport', track: 'sport', rally: 'touring', drift: 'sport',
  classic: 'touring', egt: 'sport', coupe: 'sport', wagon: 'touring',
  limo: 'touring', compact: 'touring', esedan: 'sport', jeep: 'offroad',
  gwagen: 'offroad', crossover: 'touring', hummer: 'offroad', cruiser: 'offroad',
  buggy: 'offroad', semi: 'dually', flatbed: 'dually', towtruck: 'dually',
  dump: 'dually', tanker: 'dually', raptor: 'offroad', camper: 'steel',
  shuttle: 'steel', stepvan: 'steel', patrol: 'offroad', ladder: 'dually',
  coach: 'dually', minibus: 'dually',
};

/** Deterministic factory-color pick so the same kind varies across traffic. */
export function pickVehiclePaint(kind: VehicleKind, variant = 0): number {
  const list = VEHICLE_PAINTS[kind];
  const i = ((variant % list.length) + list.length) % list.length;
  return list[i];
}
