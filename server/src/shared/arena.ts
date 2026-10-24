import type { TTSnapshot, TTShot } from './TableTennis.js';
import type { BBStyle, BBSnapshot } from './Basketball.js';
export type ArenaGame = 'table' | 'basket';
export type ArenaAction = { action: 'list' | 'host' | 'join' | 'ready' | 'start' | 'leave' | 'shot' | 'configure'; game?: ArenaGame; hostId?: string; shot?: TTShot; style?: BBStyle; aim?: number };
export interface ArenaLobby { hostId: string; game: ArenaGame; phase: 'lobby' | 'playing' | 'finished'; players: { id: string; name: string; ready: boolean; score: number; shots: number }[] }
export interface ArenaState extends ArenaLobby { table?: TTSnapshot; basket?: BBSnapshot; turn: number; shotClock?: number; message: string }
