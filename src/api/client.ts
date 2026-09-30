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

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
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
    return body as T;
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new ApiRequestError(0, 'offline', 'Server unreachable. Playing as guest.');
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

export interface RoomInfo {
  code: string;
  host_player_id: string;
  max_members: number;
  member_count: number;
}

export interface RosterEntry {
  id: string;
  name: string;
  role: 'host' | 'member';
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** Creates a private server; caller becomes host and receives the invite code. */
export function createRoom(token: string): Promise<{ room: RoomInfo }> {
  return request('/api/rooms', { method: 'POST', headers: authHeader(token) });
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
