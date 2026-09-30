/** Persisted login session (JWT + display name). Lives in localStorage only. */

export interface Session {
  token: string;
  name: string;
  id: string;
  /** Joined private server (invite code). Absent when playing solo. */
  roomCode?: string;
}

const KEY = 'agon-session';

function validSession(parsed: Partial<Session>): Session | null {
  if (typeof parsed.token !== 'string' || typeof parsed.name !== 'string' || typeof parsed.id !== 'string') return null;
  const session: Session = { token: parsed.token, name: parsed.name, id: parsed.id };
  if (typeof parsed.roomCode === 'string' && parsed.roomCode.length === 6) session.roomCode = parsed.roomCode;
  return session;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    return validSession(parsed);
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* Storage is best-effort (private mode, quotas). */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Ignore. */
  }
}
