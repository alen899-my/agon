import type { PedAgent, BuildSite, BuildDelta } from '../../server/src/agents/livingWorld';
import { realtimeUrl } from './client';

/**
 * Presence socket client. Wire-compatible with `server/src/realtime/protocol.ts`
 * — keep both sides in lockstep when changing message shapes.
 */

export interface RemotePos {
  x: number;
  z: number;
  y: number;
  yaw: number;
  facing: number;
  driving: boolean;
  vehicleKind: string;
  speed: number;
}

export interface RemoteDot {
  id: string;
  x: number;
  z: number;
  driving: boolean;
}

export interface RosterEntry {
  id: string;
  name: string;
  role: 'host' | 'member';
}

export interface RaceSnapshotMsg {
  sentAt: number;
  phase: 'idle' | 'lobby' | 'countdown' | 'racing' | 'finished';
  laps: number;
  countdownEndsAt: number;
  startedAt: number;
  racers: { id: string; name: string; ready: boolean; vehicleKind: string; lap: number; checkpoint: number; dist: number; finished: boolean; finishMs: number; bestLapMs: number }[];
}

export interface RacePosPayload {
  hostId: string;
  leaving?: boolean;
  lap: number;
  cp: number;
  dist: number;
  finished: boolean;
  finishMs: number;
  bestLapMs: number;
  vehicleKind: string;
  ready: boolean;
  blinker: number;
}

export interface RaceDirEntry {
  hostId: string;
  hostName: string;
  laps: number;
  count: number;
  phase: RaceSnapshotMsg['phase'];
}

/** Client-observed crime attributed to the sender (server validates + scores). */
export interface CrimeReport {
  type: 'kill_ped' | 'explosion' | 'shooting' | 'hit_and_run' | 'reckless_driving';
  x: number;
  z: number;
}

export interface CopStateMsg {
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

export interface RideMsg {
  steer?: number; braking?: boolean;
  id: string;
  name: string;
  kind: string;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  lap: number;
  state: 'countdown' | 'racing' | 'cooldown';
}

export interface AgentStateMsg {
  walkers?: PedAgent[];
  sites?: BuildSite[];
  cops: CopStateMsg[];
  wanted: Record<string, number>;
  rides?: RideMsg[];
}

export interface AgentEventMsg {
  kind: 'pursuit_start' | 'busted' | 'stand_down';
  copId: string;
  suspectId: string | null;
  x: number;
  z: number;
}

export interface RealtimeEvents {
  onWelcome: (room: string, you: string, roster: RosterEntry[]) => void;
  onRoster: (roster: RosterEntry[]) => void;
  onPos: (id: string, name: string, pos: RemotePos) => void;
  onRacePos: (id: string, name: string, r: RacePosPayload) => void;
  onRaceState: (id: string, name: string, s: RaceSnapshotMsg) => void;
  onRaceDir: (races: RaceDirEntry[]) => void;
  onDots: (players: RemoteDot[]) => void;
  onBuildDelta?: (delta: BuildDelta) => void;
  onAgentState?: (a: AgentStateMsg) => void;
  onAgentEvent?: (e: AgentEventMsg) => void;
  onError: (code: string, message: string) => void;
  onClose: () => void;
  onReconnecting?: () => void;
}

const HELLO_TIMEOUT_MS = 15000;
const MAX_RECONNECTS = 5;

/** Presence connection for one room. Caller sends positions; ghosts arrive via events. */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnects = 0;
  private helloTimer: number | null = null;
  private disposed = false;
  private welcomed = false;
  private everWelcomed = false;
  private retryTimer: number | null = null;

  constructor(
    private readonly token: string,
    private readonly roomCode: string,
    private readonly events: RealtimeEvents,
  ) {}

  connect(): void {
    this.dispose();
    this.disposed = false;
    this.reconnects = 0;
    this.everWelcomed = false;
    this.open();
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && this.welcomed;
  }

  sendPos(pos: RemotePos): void {
    if (this.connected) this.ws!.send(JSON.stringify({ t: 'pos', p: pos }));
  }

  sendRacePos(r: RacePosPayload): void {
    if (this.connected) this.ws!.send(JSON.stringify({ t: 'race_pos', r }));
  }

  sendRaceState(s: RaceSnapshotMsg): void {
    if (this.connected) this.ws!.send(JSON.stringify({ t: 'race_state', s }));
  }

  requestRaceDir(): void {
    if (this.connected) this.ws!.send(JSON.stringify({ t: 'race_list' }));
  }

  sendCrimeReport(c: CrimeReport): void {
    if (this.connected) this.ws!.send(JSON.stringify({ t: 'crime_report', c }));
  }

  dispose(): void {
    this.disposed = true;
    this.welcomed = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
    try {
      this.ws?.close();
    } catch {
      /* Already gone. */
    }
    this.ws = null;
  }

  private open(): void {
    if (this.disposed) return;
    let ws: WebSocket;
    try { ws = new WebSocket(realtimeUrl(this.token)); }
    catch { this.fail('connection_failed', 'Cannot open a connection to the server. Check the server address and try again.'); return; }
    this.ws = ws;
    this.welcomed = false;
    if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
    this.helloTimer = window.setTimeout(() => {
      if (!this.welcomed) {
        if (!this.everWelcomed) { this.fail('hello_timeout', 'The server did not confirm your join. Please try again.'); return; }
        try {
          ws.close();
        } catch {
          /* Ignore. */
        }
      }
    }, HELLO_TIMEOUT_MS);
    ws.onopen = () => { if (!this.disposed && this.ws === ws) ws.send(JSON.stringify({ t: 'hello', v: 1, roomCode: this.roomCode })); };
    ws.onmessage = (event) => {
      if (this.disposed || this.ws !== ws) return;
      let message: { t: string; [key: string]: unknown };
      try {
        message = JSON.parse(String(event.data)) as { t: string; [key: string]: unknown };
      } catch {
        return;
      }
      if (!message || typeof message !== 'object') return;
      switch (message.t) {
        case 'welcome':
          if (message.room !== this.roomCode || !Array.isArray(message.roster)) { this.fail('invalid_room', 'The server confirmed a different room. Please try joining again.'); return; }
          if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
          this.welcomed = true;
          this.everWelcomed = true;
          this.reconnects = 0;
          this.events.onWelcome(
            message.room as string,
            message.you as string,
            message.roster as RosterEntry[],
          );
          break;
        case 'roster':
          this.events.onRoster(message.roster as RosterEntry[]);
          break;
        case 'pos':
          this.events.onPos(message.id as string, message.name as string, message.p as RemotePos);
          break;
        case 'race_pos':
          this.events.onRacePos?.(message.id as string, message.name as string, message.r as RacePosPayload);
          break;
        case 'race_state':
          this.events.onRaceState?.(message.id as string, message.name as string, message.s as RaceSnapshotMsg);
          break;
        case 'race_dir':
          this.events.onRaceDir?.(message.races as RaceDirEntry[]);
          break;
        case 'dots':
          this.events.onDots(message.players as RemoteDot[]);
          break;
        case 'build_delta':
          this.events.onBuildDelta?.(message.delta as BuildDelta);
          break;
        case 'agent_state':
          this.events.onAgentState?.(message.a as AgentStateMsg);
          break;
        case 'agent_event':
          this.events.onAgentEvent?.(message.e as AgentEventMsg);
          break;
        case 'error':
          if (!this.welcomed) this.fail(String(message.code ?? 'error'), String(message.message ?? 'Could not join the server.'));
          else this.events.onError(String(message.code ?? 'error'), String(message.message ?? 'Server error.'));
          break;
        case 'pong':
          break;
        default:
          break;
      }
    };
    ws.onclose = (event) => {
      if (this.disposed || this.ws !== ws) return;
      this.welcomed = false;
      if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
      if (event.code === 4409) { this.fail('session_replaced', 'This player name is connected in another tab or device. Use a different name for each player.'); return; }
      if (event.code === 4401) { this.fail('unauthorized', 'Your session expired. Rejoin the server to sign in again.'); return; }
      if (event.code === 4413) { this.fail('rate_limited', 'Too many join attempts. Wait a minute before trying again.'); return; }
      if (!this.everWelcomed) { this.fail('connection_failed', 'Could not connect to the server. Check your connection and try again.'); return; }
      this.events.onReconnecting?.();
      if (this.reconnects < MAX_RECONNECTS) {
        const delay = Math.min(4000, 1000 * 2 ** this.reconnects++);
        this.retryTimer = window.setTimeout(() => this.open(), delay);
        return;
      }
      this.fail('connection_lost', 'Connection lost. Rejoin the server to reconnect.');
    };
  }

  private fail(code: string, message: string): void {
    this.dispose();
    this.events.onError(code, message);
    this.events.onClose();
  }
}
