/** Minimal HTTP client for the Agon API (see server/README.md). */

const rawBase = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000';
const BASE = rawBase.trim().replace(/\/+$/, '');

/** Base URL of the API (override with VITE_API_URL). */
export function apiBase(): string {
  return BASE;
}

/** WebSocket URL for presence: http→ws, https→wss. */
export function realtimeUrl(token: string): string {
  const wsBase = BASE.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://');
  return `${wsBase}/realtime?token=${encodeURIComponent(token)}`;
}

export interface PlayerProfile {
  id: string;
  name: string;
  created_at: string;
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    if (!response.ok) {
      throw new ApiRequestError(
        response.status,
        body?.error?.code ?? 'request_failed',
        body?.error?.message ?? `Request failed (${response.status}).`,
      );
    }
    if (!body) throw new ApiRequestError(502, 'invalid_response', 'The server returned an invalid response. Please try again.');
    return body as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    if (controller.signal.aborted) throw new ApiRequestError(0, 'timeout', 'The server took too long to respond. Please try again.');
    throw new ApiRequestError(0, 'offline', 'Cannot reach the server. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

/** Name-only login. First use creates the name, returning names sign back in. */
export function login(name: string): Promise<{ token: string; player: PlayerProfile }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ name }) });
}

/** Validates a stored token and returns the current player. */
export function me(token: string): Promise<{ player: PlayerProfile | null }> {
  return request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

export type RoomVisibility = 'public' | 'private';

export interface RoomInfo {
  code: string;
  host_player_id: string;
  max_members: number;
  member_count: number;
  name: string;
  visibility: RoomVisibility;
  host_name?: string | null;
}

export interface PublicRoomEntry {
  code: string;
  name: string;
  visibility: RoomVisibility;
  host_name: string;
  max_members: number;
  member_count: number;
  last_active_at: string;
}

export interface RosterEntry {
  id: string;
  name: string;
  role: 'host' | 'member';
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Creates a server ({ name?, visibility? }); caller becomes host and receives the invite code. */
export function createRoom(token: string, opts: { name?: string; visibility?: RoomVisibility } = {}): Promise<{ room: RoomInfo }> {
  return request('/api/rooms', { method: 'POST', headers: authHeader(token), body: JSON.stringify(opts) });
}

/** Public server browser: live public rooms with names, hosts and member counts. */
export function listPublicRooms(token: string): Promise<{ rooms: PublicRoomEntry[] }> {
  return request('/api/rooms', { headers: authHeader(token) });
}

/** Invite link for a private (or public) server code. */
export function inviteLink(code: string): string {
  return `${location.origin}/?code=${encodeURIComponent(code)}`;
}

/** Server code from a `?code=` invite link, if present and well-formed. */
export function inviteCodeFromUrl(): string {
  try {
    const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase().replace(/[\s-]+/g, '') ?? '';
    return /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code) ? code : '';
  } catch {
    return '';
  }
}

/** Live pre-join check: exists + capacity, without leaking the roster. */
export function checkRoom(token: string, code: string): Promise<{ room: RoomInfo; full: boolean }> {
  return request(`/api/rooms/${encodeURIComponent(code)}`, { headers: authHeader(token) });
}

/** Joins a server by invite code (idempotent). */
export function joinRoom(token: string, code: string): Promise<{ room: RoomInfo; roster: RosterEntry[] }> {
  return request('/api/rooms/join', { method: 'POST', headers: authHeader(token), body: JSON.stringify({ code }) });
}

/** Leaves a server; host migrates, last player out deletes it. */
export function leaveRoom(token: string, code: string): Promise<{ left: string }> {
  return request('/api/rooms/leave', { method: 'POST', headers: authHeader(token), body: JSON.stringify({ code }) });
}

export interface DialogueParticipant { id: string; name: string; role: string }
export interface DialogueContextPayload { participants: DialogueParticipant[]; situation: string; history: string[] }

/** Solo/social chatter via the server Gemini chain (primary lite → lite fallback). Null = scripted/offline. */
export async function fetchDialogue(token: string, context: DialogueContextPayload): Promise<string[] | null> {
  if (!token) return null;
  try {
    const body = await request<{ lines: string[] | null }>('/api/dialogue', {
      method: 'POST', headers: authHeader(token), body: JSON.stringify(context),
    }, 15000);
    return Array.isArray(body.lines) && body.lines.length > 0 ? body.lines : null;
  } catch {
    return null;
  }
}

export interface DispatchPayload {
  now: number;
  cops: { id: string; x: number; z: number; yaw: number; speed: number; mode: 'patrol' | 'respond' | 'pursue' | 'arrest' | 'return'; lightsOn: boolean; suspectId: string | null }[];
  suspects: { playerId: string; name: string; x: number; z: number; speed: number; driving: boolean; wanted: number; lastCrimeAt: number; lastKnownX: number; lastKnownZ: number }[];
  world?: string;
  escalate?: boolean;
}

/** Solo police tactics via the server Gemini chain. Null = hold current goal (scripted). */
export async function fetchDispatch(token: string, payload: DispatchPayload): Promise<{ action: string; suspectId?: string; x?: number; z?: number } | null> {
  if (!token) return null;
  try {
    const body = await request<{ goal: { action: string; suspectId?: string; x?: number; z?: number } | null }>('/api/dialogue/decide', {
      method: 'POST', headers: authHeader(token), body: JSON.stringify(payload),
    }, 12000);
    return body.goal ?? null;
  } catch {
    return null;
  }
}

export interface AiStatus {
  enabled: boolean; configured: boolean; provider: string; model: string;
  escalationModel?: string; requests?: number; successes?: number; lastError?: string;
}

/** Backend AI health (no auth): model names + last Gemini error. Check this when "no AI is used". */
export async function fetchAiStatus(): Promise<AiStatus | null> {
  try {
    return await request<AiStatus>('/api/dialogue/status', {}, 8000);
  } catch {
    return null;
  }
}
