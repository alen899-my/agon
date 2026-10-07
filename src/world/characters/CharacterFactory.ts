/**
 * CharacterFactory (client side): registry for AI-driven custom characters.
 *
 * Any custom character can be coded easily by registering a def once:
 *
 *   import { CharacterFactory } from './characters/CharacterFactory';
 *   CharacterFactory.register({
 *     role: 'medic',
 *     displayName: 'Paramedic',
 *     enabled: true,
 *     body: { kind: 'vehicle', vehicleKind: 'ambulance' },
 *     outfit: { shirt: 0xf5f5f5, pants: 0x1c1e22, skin: 0xc68642, hat: 'cap', vest: false },
 *     home: { x: 22, z: -12 },
 *     blurb: 'Rushes to blast victims and revives them.',
 *   });
 *
 * Bodies mirror the server registry (`server/src/agents/characters.ts`) —
 * keep role names identical on both sides. The 20-agent roster below
 * (ROSTER) is the default living world: cops, builders, medics, racers,
 * vendors, guards, joggers, kids and performers spread across the map.
 */
import { OUTFITS, ROSTER20 } from '../../../server/src/agents/livingWorld';
import type { VehicleKind } from '../Vehicles';

export type CharacterRole = string;

export interface CharacterBody {
  kind: 'vehicle' | 'ped';
  /** Vehicle spec key (must exist in VEHICLES). */
  vehicleKind?: VehicleKind;
  /** Stickman variation index 0..8 for ped bodies. */
  pedVariant?: number;
}

export interface CharacterOutfit {
  shirt: number;
  pants: number;
  skin: number;
  hat: 'none' | 'cap' | 'helmet';
  vest: boolean;
}

export interface CharacterDef {
  role: CharacterRole;
  displayName: string;
  enabled: boolean;
  body: CharacterBody;
  outfit: CharacterOutfit;
  /** Home turf anchor (task loops start here). */
  home: { x: number; z: number };
  blurb: string;
}

/** Stable pool key so WorldEngine reuses meshes per role. */
export function bodyKey(body: CharacterBody): string {
  return body.kind === 'vehicle' ? `veh:${body.vehicleKind ?? 'car'}` : `ped:${body.pedVariant ?? 0}`;
}

class Factory {
  private readonly defs = new Map<CharacterRole, CharacterDef>();

  register(def: CharacterDef): void {
    this.defs.set(def.role, def);
  }

  get(role: CharacterRole): CharacterDef | undefined {
    return this.defs.get(role);
  }

  enabled(): CharacterDef[] {
    return [...this.defs.values()].filter((d) => d.enabled);
  }
}

export const CharacterFactory = new Factory();

CharacterFactory.register({
  role: 'police',
  displayName: 'Police Officer',
  enabled: true,
  body: { kind: 'vehicle', vehicleKind: 'police' },
  outfit: { shirt: 0x1a3a8f, pants: 0x14181f, skin: 0xc68642, hat: 'cap', vest: false },
  home: { x: 42, z: 27 },
  blurb: 'Responds to crimes, pursues suspects, makes arrests.',
});

/** Phase 2 example: construction workers that raise real buildings. */
CharacterFactory.register({
  role: 'builder',
  displayName: 'Construction Worker',
  enabled: true,
  body: { kind: 'ped', pedVariant: 3 },
  outfit: { shirt: 0xff6d00, pants: 0x3a3a3a, skin: 0x8d5524, hat: 'helmet', vest: true },
  home: { x: -45, z: 65 },
  blurb: 'Fetches materials and builds at construction sites.',
});

/**
 * Single source of truth for the 20-agent roster lives server-side
 * (`ROSTER20` in livingWorld.ts) so solo + rooms simulate identical people.
 * This factory mirrors it for rendering: outfits from server OUTFITS,
 * vehicle bodies for the roles that drive.
 */
export const ROSTER = ROSTER20;

const ROLE_BLURBS: Record<string, string> = {
  police: 'Foot patrol, chases criminals, makes arrests.',
  builder: 'Fetches materials and raises buildings.',
  medic: 'Rushes to victims and revives them.',
  racer: 'Street racer, challenges rivals on the Grand Circuit.',
  vendor: 'Sells food, chats up customers.',
  elder: 'Storyteller, gathers listeners in the garden.',
  jogger: 'Loops the park, races friends.',
  guard: 'Harbor guard, shoos intruders.',
  photo: 'Photographs landmarks and racers.',
  kid: 'Plays tag around the plaza.',
  mechanic: 'Tows wrecks, repairs at the station.',
  dancer: 'Performs in the plaza and draws spectators.',
  drifter: 'Paddock regular who watches and cheers on the racers.',
  resident: 'Neighbor going about the day.',
};

for (let i = 0; i < ROSTER20.length; i++) {
  const entry = ROSTER20[i];
  if (CharacterFactory.get(entry.role)) continue;
  const outfit = OUTFITS[entry.role];
  CharacterFactory.register({
    role: entry.role,
    displayName: entry.role[0].toUpperCase() + entry.role.slice(1),
    enabled: true,
    body: { kind: 'ped', pedVariant: i % 9 },
    outfit: { shirt: outfit.shirt, pants: outfit.pants, skin: outfit.skin, hat: outfit.hat ?? 'none', vest: outfit.vest ?? false },
    home: entry.home,
    blurb: ROLE_BLURBS[entry.role] ?? 'Neighbor.',
  });
}
