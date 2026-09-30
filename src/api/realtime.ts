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

export interface RealtimeEvents {
  onWelcome: (room: string, you: string, roster: RosterEntry[]) => void;
  onRoster: (roster: RosterEntry[]) => void;
  onPos: (id: string, name: string, pos: RemotePos) => void;
  onDots: (players: RemoteDot[]) => void;
  onError: (code: string, message: string) => void;
  onClose: () => void;
}

const HELLO_TIMEOUT_MS = 6000;
const MAX_RECONNECTS = 5;

/** Presence connection for one room. Caller sends positions; ghosts arrive via events. */
export class RealtimeClient {
  private ws: WebSocket | null = null;
  private reconnects = 0;
  private helloTimer: number | null = null;
  private disposed = false;
  private welcomed = false;

  constructor(
    private readonly token: string,
    private readonly roomCode: string,
    private readonly events: RealtimeEvents,
  ) {}

  connect(): void {
    this.disposed = false;
    this.open();
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && this.welcomed;
  }

  sendPos(pos: RemotePos): void {
    if (this.connected) this.ws!.send(JSON.stringify({ t: 'pos', p: pos }));
  }

  dispose(): void {
    this.disposed = true;
    if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
    try {
      this.ws?.close();
    } catch {
      /* Already gone. */
    }
    this.ws = null;
  }

  private open(): void {
    const ws = new WebSocket(realtimeUrl(this.token));
    this.ws = ws;
    this.welcomed = false;
    if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
    this.helloTimer = window.setTimeout(() => {
      if (!this.welcomed) {
        this.events.onError('hello_timeout', 'Server did not answer. Staying solo.');
        try {
          ws.close();
        } catch {
          /* Ignore. */
        }
      }
    }, HELLO_TIMEOUT_MS);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: 1, roomCode: this.roomCode }));
    ws.onmessage = (event) => {
      let message: { t: string; [key: string]: unknown };
      try {
        message = JSON.parse(String(event.data)) as { t: string; [key: string]: unknown };
      } catch {
        return;
      }
      switch (message.t) {
        case 'welcome':
          this.welcomed = true;
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
        case 'dots':
          this.events.onDots(message.players as RemoteDot[]);
          break;
        case 'error':
          this.events.onError(String(message.code ?? 'error'), String(message.message ?? 'Server error.'));
          break;
        case 'pong':
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      if (this.helloTimer !== null) window.clearTimeout(this.helloTimer);
      if (this.disposed) return;
      // Brief backoff reconnects for mobile network blips; then surface as closed.
      if (this.reconnects < MAX_RECONNECTS) {
        const delay = Math.min(4000, 1000 * 2 ** this.reconnects);
        this.reconnects += 1;
        window.setTimeout(() => {
          if (!this.disposed) this.open();
        }, delay);
        return;
      }
      this.events.onClose();
    };
  }
}
