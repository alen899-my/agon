import type { EngineFlavor } from './VehicleAudio';
import type { VehicleCustomization } from '../world/VehicleCustomization';
export function garageSound(sound?: VehicleCustomization['sound']): EngineFlavor | undefined {
  return sound === 'sport' ? 'sport' : sound === 'v8' ? 'suv' : sound === 'diesel' ? 'truck' : sound === 'electric' ? 'ev' : undefined;
}
