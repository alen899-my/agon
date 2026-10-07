import { OUTFITS, type Appearance } from './livingWorld.js';
/**
 * CharacterFactory (server side): role registry for AI-driven characters.
 *
 * To add a custom character, call `registerCharacter({...})` once at boot:
 *
 *   registerCharacter({
 *     role: 'medic', displayName: 'Paramedic', enabled: true,
 *     body: { kind: 'vehicle', vehicleKind: 'ambulance' },
 *     maxPerRoom: 1,
 *     systemPrompt: '...',
 *     goals: ['patrol', 'respond', 'standDown'],
 *   });
 *
 * The client mirrors bodies in `src/world/characters/CharacterFactory.ts`.
 * Builders are registered below with `enabled: false` — same pattern, next phase.
 */
import type { AgentBodyKind, AgentGoalAction, AgentRole } from './types.js';

export interface CharacterDef {
  outfit?: Appearance;
  footBody?: { kind: 'ped' };
  role: AgentRole;
  displayName: string;
  /** Builders flip this on when construction sites land. */
  enabled: boolean;
  body: { kind: AgentBodyKind; vehicleKind?: string; pedVariant?: number };
  maxPerRoom: number;
  /** Extra system-prompt lines for the LLM brain when driving this role. */
  systemPrompt: string;
  goals: AgentGoalAction[];
}

const registry = new Map<AgentRole, CharacterDef>();

export function registerCharacter(def: CharacterDef): void {
  registry.set(def.role, def);
}

export function getCharacter(role: AgentRole): CharacterDef | undefined {
  return registry.get(role);
}

export function listCharacters(): CharacterDef[] {
  return [...registry.values()];
}

registerCharacter({
  role: 'police',
  outfit: OUTFITS.police,
  footBody: { kind: 'ped' },
  displayName: 'Police Officer',
  enabled: true,
  body: { kind: 'vehicle', vehicleKind: 'police' },
  maxPerRoom: 2,
  systemPrompt:
    'You dispatch ONE police cruiser GTA-style. Prefer pursue for armed/dangerous ' +
    'suspects, roadblock to cut off fast drivers, standDown when all suspects are calm.',
  goals: ['patrol', 'pursue', 'roadblock', 'standDown'],
});

/** Phase 2: construction workers that raise real colliders via build goals. */
registerCharacter({
  role: 'builder',
  outfit: OUTFITS.builder,
  displayName: 'Construction Worker',
  enabled: true,
  body: { kind: 'ped', pedVariant: 3 },
  maxPerRoom: 4,
  systemPrompt:
    'You run a construction crew. Order fetch for materials, build at site markers, idle otherwise.',
  goals: ['fetch', 'build', 'idle'],
});

registerCharacter({ role: 'medic', displayName: 'Medic', outfit: OUTFITS.medic, enabled: true, body: { kind: 'ped' }, maxPerRoom: 4, systemPrompt: 'Use deterministic world rules.', goals: ['idle'] });

registerCharacter({ role: 'vendor', displayName: 'Vendor', outfit: OUTFITS.vendor, enabled: true, body: { kind: 'ped' }, maxPerRoom: 4, systemPrompt: 'Use deterministic world rules.', goals: ['idle'] });

registerCharacter({ role: 'resident', displayName: 'Resident', outfit: OUTFITS.resident, enabled: true, body: { kind: 'ped' }, maxPerRoom: 4, systemPrompt: 'Use deterministic world rules.', goals: ['idle'] });
