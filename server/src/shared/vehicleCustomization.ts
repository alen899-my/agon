/** Shared, bounded save format used by persistence, presence and the renderer. */
export const PART_OPTIONS = {
  finish: ['gloss', 'metallic', 'matte'],
  tyres: ['stock', 'street', 'slick', 'offroad', 'drift'],
  rims: ['stock', 'fiveSpoke', 'mesh', 'disc', 'steel'],
  engine: ['stock', 'sport', 'race'],
  transmission: ['stock', 'sport', 'race'],
  brakes: ['stock', 'sport', 'ceramic'],
  suspension: ['stock', 'lowered', 'rally'],
  hood: ['stock', 'carbon', 'vented', 'scoop'],
  roof: ['stock', 'carbon', 'rack'],
  frontBumper: ['stock', 'sport', 'race'],
  rearBumper: ['stock', 'sport', 'diffuser'],
  skirts: ['stock', 'sport', 'carbon'],
  spoiler: ['stock', 'lip', 'wing'],
  exhaust: ['stock', 'dual', 'quad'],
  tint: ['stock', 'light', 'dark'],
  lights: ['stock', 'ice', 'amber'],
  underglow: ['off', 'cyan', 'purple', 'red'],
  sound: ['stock', 'sport', 'v8', 'diesel', 'electric'],
} as const;
export type PartKey = keyof typeof PART_OPTIONS;
export type VehicleCustomization = { [K in PartKey]: (typeof PART_OPTIONS)[K][number] } & {
  version: 1; paint: string; rimColor: string;
};
export const DEFAULT_CUSTOMIZATION: VehicleCustomization = {
  version: 1, paint: '#d8dce2', rimColor: '#bcc3ce', finish: 'gloss', tyres: 'stock', rims: 'stock',
  engine: 'stock', transmission: 'stock', brakes: 'stock', suspension: 'stock', hood: 'stock', roof: 'stock',
  frontBumper: 'stock', rearBumper: 'stock', skirts: 'stock', spoiler: 'stock', exhaust: 'stock',
  tint: 'stock', lights: 'stock', underglow: 'off', sound: 'stock',
};
export function validCustomization(value: unknown): value is VehicleCustomization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return v.version === 1 && typeof v.paint === 'string' && /^#[0-9a-f]{6}$/i.test(v.paint)
    && typeof v.rimColor === 'string' && /^#[0-9a-f]{6}$/i.test(v.rimColor)
    && Object.entries(PART_OPTIONS).every(([key, choices]) => (choices as readonly unknown[]).includes(v[key]))
    && Object.keys(v).every(key => key === 'version' || key === 'paint' || key === 'rimColor' || Object.hasOwn(PART_OPTIONS, key));
}
export function tuning(c?: VehicleCustomization) {
  return {
    speed: c?.engine === 'race' ? 1.18 : c?.engine === 'sport' ? 1.08 : 1,
    acceleration: (c?.engine === 'race' ? 1.3 : c?.engine === 'sport' ? 1.15 : 1) * (c?.transmission === 'race' ? 1.12 : c?.transmission === 'sport' ? 1.06 : 1),
    grip: (c?.tyres === 'slick' ? 1.22 : c?.tyres === 'street' ? 1.08 : c?.tyres === 'drift' ? 0.75 : c?.tyres === 'offroad' ? 0.95 : 1) * (c?.suspension === 'lowered' ? 1.08 : c?.suspension === 'rally' ? 0.96 : 1),
    braking: c?.brakes === 'ceramic' ? 1.3 : c?.brakes === 'sport' ? 1.15 : 1,
  };
}
