export const RIGS = [
  { name: 'Maruti Suzuki Gypsy', label: 'Lightweight explorer', mass: 1050, wheelbase: 2.375, track: 1.3, length: 4.01, width: 1.54, radius: .35, torque: 103, final: 4.1, travel: .24, color: 0xd4cbb1, cabin: 1.85 },
  { name: 'Mahindra Thar', label: 'Short wheelbase crawler', mass: 1820, wheelbase: 2.45, track: 1.52, length: 3.985, width: 1.82, radius: .39, torque: 300, final: 3.73, travel: .3, color: 0x9b4231, cabin: 1.95 },
  { name: 'Mitsubishi Pajero', label: 'Heavy expedition wagon', mass: 2150, wheelbase: 2.78, track: 1.56, length: 4.9, width: 1.875, radius: .38, torque: 350, final: 4.1, travel: .25, color: 0x577369, cabin: 2.85 },
  { name: 'Force Gurkha', label: 'Hard-core rock crawler', mass: 1950, wheelbase: 2.7, track: 1.51, length: 4.19, width: 1.82, radius: .41, torque: 320, final: 4.0, travel: .34, color: 0x3a3f2e, cabin: 2.1 },
  { name: 'Isuzu D-Max', label: 'Mountain utility pickup', mass: 2050, wheelbase: 3.095, track: 1.52, length: 5.255, width: 1.86, radius: .38, torque: 380, final: 3.9, travel: .28, color: 0x7a8c96, cabin: 1.65 },
  { name: 'Toyota Land Cruiser', label: 'Heavy high-altitude SUV', mass: 2560, wheelbase: 2.85, track: 1.59, length: 4.95, width: 1.98, radius: .39, torque: 430, final: 4.3, travel: .26, color: 0xb8b2a7, cabin: 3.05 },
  { name: 'Tata Safari', label: 'Family mountain wagon', mass: 2050, wheelbase: 2.74, track: 1.5, length: 4.66, width: 1.89, radius: .37, torque: 295, final: 3.8, travel: .24, color: 0x8c6234, cabin: 2.75 },
  { name: 'Mahindra Bolero', label: 'Rugged utility workhorse', mass: 1745, wheelbase: 2.68, track: 1.49, length: 4.19, width: 1.77, radius: .36, torque: 225, final: 4.1, travel: .22, color: 0x4a5a4a, cabin: 2.3 },
  { name: 'Toyota Hilux', label: 'Mid-size expedition pickup', mass: 1970, wheelbase: 3.085, track: 1.55, length: 5.33, width: 1.855, radius: .37, torque: 420, final: 4.1, travel: .27, color: 0x4a6b8a, cabin: 1.6 },
] as const;
export interface Rig { name:string; label:string; mass:number; wheelbase:number; track:number; length:number; width:number; radius:number; torque:number; final:number; travel:number; color:number; cabin:number; }


