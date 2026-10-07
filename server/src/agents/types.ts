import type { PedAgent, BuildSite } from './livingWorld.js';
/**
 * Agent role system contracts (server authority).
 *
 * Roles are data: a CharacterDef + a goal enum the LLM may pick from.
 * Deterministic drivers execute the goals every tick, so a slow or missing
 * model degrades to scripted behavior instead of freezing the world.
 */

export type AgentRole =
  | 'police' | 'builder' | 'medic' | 'vendor' | 'resident'
  | 'racer' | 'jogger' | 'kid' | 'guard' | 'photo' | 'mechanic'
  | 'dancer' | 'drifter' | 'elder';

export type AgentBodyKind = 'vehicle' | 'ped';

/** Closed set of tactics the LLM brain may order. Never free movement. */
export type AgentGoalAction =
  | 'patrol'
  | 'pursue'
  | 'roadblock'
  | 'standDown'
  | 'idle'
  | 'build'
  | 'fetch';

export interface AgentGoal {
  action: AgentGoalAction;
  /** Player id for pursue. */
  suspectId?: string;
  /** Target point for roadblock / build / fetch. */
  x?: number;
  z?: number;
  /**
   * World directives for walkers (event-driven, cached — never per-second).
   * siteFocus steers the builder crew; raceNow starts Maya vs Leo.
   */
  directives?: { siteFocus?: string; raceNow?: boolean };
}

export interface CrimeEvent {
  type: 'kill_ped' | 'explosion' | 'shooting' | 'hit_and_run' | 'reckless_driving';
  x: number;
  z: number;
  at: number;
}

export interface SuspectInfo {
  playerId: string;
  name: string;
  x: number;
  z: number;
  speed: number;
  driving: boolean;
  wanted: number;
  lastCrimeAt: number;
  lastKnownX: number;
  lastKnownZ: number;
}

export interface CopInfo {
  onFoot?: boolean;
  vehicleX?: number;
  vehicleZ?: number;
  id: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  mode: 'patrol' | 'respond' | 'pursue' | 'arrest' | 'return';
  lightsOn: boolean;
  suspectId: string | null;
}

export interface DirectorSnapshot {
  walkers: PedAgent[];
  sites: BuildSite[];
  cops: CopInfo[];
  wanted: Record<string, number>;
  rides?: import('./livingWorld.js').RideState[];
}

export type AgentEventKind = 'pursuit_start' | 'busted' | 'stand_down';

export interface AgentEvent {
  kind: AgentEventKind;
  copId: string;
  suspectId: string | null;
  x: number;
  z: number;
}

/** Context handed to a brain (LLM or scripted) to decide the next goal. */
export interface DirectorContext {
  sites?: BuildSite[];
  escalate?: boolean;
  /** Compact world summary: unfinished sites, open incidents, racer state. */
  world?: string;
  rides?: { id: string; name: string; state: string; lap: number }[];
  now: number;
  cops: CopInfo[];
  suspects: SuspectInfo[];
}

export interface Brain {
  readonly name: string;
  decide(ctx: DirectorContext): Promise<AgentGoal | null>;
}
