/** Shared, bounded save format used by persistence, presence and the renderer. */
const LEGACY_OPTIONS = {
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
const SERIES = ['street', 'club', 'rally', 'endurance', 'extreme'] as const;
type WorkshopOption = `${typeof SERIES[number]}-${1 | 2 | 3 | 4}`;
const upgrades = SERIES.flatMap(series => [1, 2, 3, 4].map(stage => `${series}-${stage}` as WorkshopOption));
export const PART_OPTIONS = Object.fromEntries(Object.entries(LEGACY_OPTIONS).map(([key, options]) => [key, [...options, ...upgrades]])) as unknown as {
  [K in keyof typeof LEGACY_OPTIONS]: readonly ((typeof LEGACY_OPTIONS)[K][number] | WorkshopOption)[]
};
export function partProfile(option: string) {
  const [series, stageText] = option.split('-');
  const family = SERIES.indexOf(series as typeof SERIES[number]);
  const stage = family < 0 ? 0 : Number(stageText) || 1;
  return { family, stage, level: family < 0 ? 0 : (family * 4 + stage) / 20 };
}
const BASES: Record<keyof typeof LEGACY_OPTIONS, readonly string[]> = {
  finish: ['gloss', 'metallic', 'matte', 'metallic', 'gloss'], tyres: ['street', 'slick', 'offroad', 'street', 'drift'],
  rims: ['fiveSpoke', 'mesh', 'steel', 'disc', 'mesh'], engine: ['sport', 'race', 'sport', 'race', 'race'],
  transmission: ['sport', 'race', 'sport', 'race', 'race'], brakes: ['sport', 'ceramic', 'sport', 'ceramic', 'ceramic'],
  suspension: ['lowered', 'lowered', 'rally', 'stock', 'lowered'], hood: ['vented', 'carbon', 'scoop', 'vented', 'scoop'],
  roof: ['carbon', 'carbon', 'rack', 'rack', 'carbon'], frontBumper: ['sport', 'race', 'sport', 'race', 'race'],
  rearBumper: ['sport', 'diffuser', 'sport', 'diffuser', 'diffuser'], skirts: ['sport', 'carbon', 'sport', 'carbon', 'carbon'],
  spoiler: ['lip', 'wing', 'lip', 'wing', 'wing'], exhaust: ['dual', 'quad', 'dual', 'quad', 'quad'],
  tint: ['light', 'dark', 'light', 'dark', 'dark'], lights: ['ice', 'ice', 'amber', 'ice', 'amber'],
  underglow: ['cyan', 'purple', 'red', 'cyan', 'purple'], sound: ['sport', 'sport', 'diesel', 'v8', 'electric'],
};
export function resolvedBuild(build: VehicleCustomization): VehicleCustomization {
  const result = { ...build };
  for (const key of Object.keys(PART_OPTIONS) as PartKey[]) {
    const { family } = partProfile(build[key]);
    if (family >= 0) Object.assign(result, { [key]: BASES[key][family] });
  }
  return result;
}
export function partLabel(option: string): string {
  const { family, stage } = partProfile(option);
  return family < 0 ? option.replace(/([a-z])([A-Z])/g, '$1 $2') : SERIES[family] + ' / 0' + stage;
}
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
export function tuning(build?: VehicleCustomization) {
  const c = build ? resolvedBuild(build) : undefined;
  const level = (key: PartKey) => build ? partProfile(build[key]).level : 0;
  return {
    speed: (c?.engine === 'race' ? 1.18 : c?.engine === 'sport' ? 1.08 : 1) + level('engine') * 0.22,
    acceleration: (c?.engine === 'race' ? 1.3 : c?.engine === 'sport' ? 1.15 : 1) * (c?.transmission === 'race' ? 1.12 : c?.transmission === 'sport' ? 1.06 : 1) * (1 + level('engine') * 0.25 + level('transmission') * 0.12),
    grip: (c?.tyres === 'slick' ? 1.22 : c?.tyres === 'street' ? 1.08 : c?.tyres === 'drift' ? 0.75 : c?.tyres === 'offroad' ? 0.95 : 1) * (c?.suspension === 'lowered' ? 1.08 : c?.suspension === 'rally' ? 0.96 : 1) * (1 + level('tyres') * 0.1 + level('suspension') * 0.06),
    braking: (c?.brakes === 'ceramic' ? 1.3 : c?.brakes === 'sport' ? 1.15 : 1) + level('brakes') * 0.25,
  };
}
