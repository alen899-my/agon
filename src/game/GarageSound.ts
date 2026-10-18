import { DEFAULT_CUSTOMIZATION, resolvedBuild, partProfile } from '../../server/src/shared/vehicleCustomization';
import type { EngineFlavor } from './VehicleAudio';
import type { VehicleCustomization } from '../world/VehicleCustomization';
export function garageSound(sound?: VehicleCustomization['sound']): EngineFlavor | undefined {
  sound = resolvedBuild({ ...DEFAULT_CUSTOMIZATION, sound: sound ?? 'stock' }).sound;
  return sound === 'sport' ? 'sport' : sound === 'v8' ? 'suv' : sound === 'diesel' ? 'truck' : sound === 'electric' ? 'ev' : undefined;
}

export function garagePitch(sound?: VehicleCustomization['sound']): number {
  const { family, stage } = partProfile(sound ?? 'stock');
  return family < 0 ? 1 : 0.84 + family * 0.025 + stage * 0.065;
}
