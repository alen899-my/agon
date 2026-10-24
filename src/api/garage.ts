import { getGarage, saveGarageVehicle } from './client';
import type { Session } from './session';
import { VEHICLE_KINDS, type VehicleKind } from '../world/Vehicles';
import { validCustomization, type VehicleCustomization } from '../world/VehicleCustomization';

export interface GarageRecord { kind: VehicleKind; customization: VehicleCustomization; updated_at: string; pending?: boolean }
const key = (name: string) => 'agon-garage-v1:' + name.trim().replace(/\s+/g, ' ');
export function readGarage(name: string): GarageRecord[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key(name)) ?? '[]');
    return Array.isArray(data) ? data.filter((r): r is GarageRecord => r && VEHICLE_KINDS.includes(r.kind) && validCustomization(r.customization) && typeof r.updated_at === 'string').slice(0, VEHICLE_KINDS.length) : [];
  } catch { return []; }
}
function writeGarage(name: string, records: GarageRecord[]): boolean {
  try { localStorage.setItem(key(name), JSON.stringify(records)); return true; } catch { return false; }
}
export async function loadGarage(session: Session): Promise<{ records: GarageRecord[]; notice: string }> {
  const local = readGarage(session.name);
  if (!session.token) return { records: local, notice: local.length ? 'Local garage loaded. Sign in online to sync your builds.' : '' };
  try {
    const { vehicles } = await getGarage(session.token);
    const map = new Map<VehicleKind, GarageRecord>();
    for (const record of vehicles) if (VEHICLE_KINDS.includes(record.kind) && validCustomization(record.customization)) map.set(record.kind, record);
    for (const record of local.filter(r => r.pending)) {
      try { const saved = await saveGarageVehicle(session.token, record.kind, record.customization); map.set(record.kind, saved.vehicle); }
      catch { map.set(record.kind, record); }
    }
    const records = [...map.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    writeGarage(session.name, records);
    return { records, notice: '' };
  } catch {
    return { records: local, notice: 'Server garage unavailable. Local builds loaded; reconnect to sync.' };
  }
}
export async function persistBuild(session: Session, kind: VehicleKind, customization: VehicleCustomization): Promise<string> {
  const local = readGarage(session.name).filter(r => r.kind !== kind);
  const record: GarageRecord = { kind, customization: { ...customization }, updated_at: new Date().toISOString(), pending: true };
  const stored = writeGarage(session.name, [record, ...local]);
  if (session.token) {
    try {
      const { vehicle } = await saveGarageVehicle(session.token, kind, customization);
      writeGarage(session.name, [vehicle, ...local]);
      return 'Saved to your account. Ready in solo and every server.';
    } catch (error) {
      if (!stored) throw error;
      return 'Saved on this device. Server sync pending — sign in online again to retry.';
    }
  }
  if (!stored) throw new Error('Device storage is unavailable. Connect to the server before saving.');
  return 'Saved on this device. Sign in online with the same name to sync.';
}
