export const RIGS = [
  { name: 'Maruti Suzuki Gypsy', label: 'Lightweight explorer', mass: 1050, wheelbase: 2.375, track: 1.3, length: 4.01, width: 1.54, radius: .35, torque: 103, final: 4.1, travel: .24, color: 0xd4cbb1, cabin: 1.85 },
  { name: 'Mahindra Thar', label: 'Short wheelbase crawler', mass: 1820, wheelbase: 2.45, track: 1.52, length: 3.985, width: 1.82, radius: .39, torque: 300, final: 3.73, travel: .3, color: 0x9b4231, cabin: 1.95 },
  { name: 'Mitsubishi Pajero', label: 'Heavy expedition wagon', mass: 2150, wheelbase: 2.78, track: 1.56, length: 4.9, width: 1.875, radius: .38, torque: 350, final: 4.1, travel: .25, color: 0x577369, cabin: 2.85 },
] as const;
export interface Rig { name:string; label:string; mass:number; wheelbase:number; track:number; length:number; width:number; radius:number; torque:number; final:number; travel:number; color:number; cabin:number; }

