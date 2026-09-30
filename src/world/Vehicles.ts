export const VEHICLES = {
  car: { name: 'Sedan', length: 4.3, height: 0.75, topSpeed: 32, acceleration: 7, grip: 8 },
  sport: { name: 'Sport coupe', length: 4.2, height: 0.6, topSpeed: 46, acceleration: 10, grip: 9 },
  suv: { name: 'SUV', length: 5, height: 1.2, topSpeed: 30, acceleration: 6, grip: 7 },
  pickup: { name: 'Pickup', length: 5.6, height: 1.1, topSpeed: 29, acceleration: 5.5, grip: 6 },
  van: { name: 'Cargo van', length: 5.8, height: 1.4, topSpeed: 25, acceleration: 4.5, grip: 7 },
  bus: { name: 'City bus', length: 8, height: 1.8, topSpeed: 22, acceleration: 3, grip: 6 },
} as const;
export type VehicleKind = keyof typeof VEHICLES;
export const VEHICLE_KINDS = Object.keys(VEHICLES) as VehicleKind[];
