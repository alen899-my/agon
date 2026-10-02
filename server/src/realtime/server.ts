import type { Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { getById } from '../services/players.service.js';
import { verifyToken } from '../services/tokens.service.js';
import { RoomHub, type MemberState } from './hub.js';
import type { ClientMessage } from './protocol.js';

const HEARTBEAT_MS = 25_000;

function sendError(ws: WebSocket, code: string, message: string): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'error', code, message }));
}

/** Attaches the presence endpoint (`/realtime`) to the API's HTTP server. */
export function attachRealtime(server: HttpServer): RoomHub {
  const hub = new RoomHub();
  const wss = new WebSocketServer({ server, path: '/realtime' });

  // Heartbeat: drop connections that stop answering pongs.
  const sweep = setInterval(() => {
    hub.eachSocket((state) => {
      if (!state.alive) {
        state.ws.terminate();
        return;
      }
      state.alive = false;
      try {
        state.ws.ping();
      } catch {
        /* Terminated below on next sweep. */
      }
    });
  }, HEARTBEAT_MS);
  sweep.unref?.();

  wss.on('connection', (ws: WebSocket, req) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.socket as Socket).remoteAddress || 'unknown';
    let authed: { id: string; name: string } | null = null;
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const payload = verifyToken(url.searchParams.get('token') ?? '');
      authed = { id: payload.sub, name: payload.name };
    } catch {
      ws.close(4401, 'unauthorized');
      return;
    }
    // Buffer early messages: clients often send `hello` the instant the
    // socket opens, before the async player lookup below has attached
    // routing. Without this, the first message is silently dropped.
    const pending: string[] = [];
    let state: MemberState | null = null;
    let closed = false;
    const route = (text: string): void => {
      if (!state) {
        if (pending.length < 10) pending.push(text);
        return;
      }
      let message: ClientMessage;
      try {
        message = JSON.parse(text) as ClientMessage;
      } catch {
        sendError(ws, 'bad_message', 'Expected JSON.');
        return;
      }
      if (!message || typeof message !== 'object') { sendError(ws, 'bad_message', 'Expected a message object.'); return; }
      if (message.t === 'hello') hub.onHello(state, message.roomCode, ip).catch((error) => {
        console.error('[realtime] hello failed', error);
        sendError(ws, 'hello_failed', 'Could not join that server.');
      });
      else if (message.t === 'pos') hub.onPos(state, message.p);
      else if (message.t === 'race_pos') hub.onRacePos(state, (message as { r: unknown }).r);
      else if (message.t === 'race_state') hub.onRaceState(state, (message as { s: unknown }).s);
      else if (message.t === 'race_list') hub.onRaceList(state);
      else if (message.t === 'ping') {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'pong' }));
      }
    };
    ws.on('message', (data) => route(String(data)));
    ws.on('close', () => {
      closed = true;
      if (state) hub.onLeave(state);
    });
    ws.on('error', () => {
      if (state) hub.onLeave(state);
    });
    void getById(authed.id)
      .then((player) => {
        if (!player) {
          ws.close(4401, 'unknown player');
          return;
        }
        if (closed || ws.readyState !== ws.OPEN) return;
        state = hub.admit(ws, player.id, player.name);
        ws.on('pong', () => {
          if (state) state.alive = true;
        });
        for (const text of pending.splice(0)) route(text);
      })
      .catch(() => ws.close(4411, 'auth lookup failed'));
  });

  return hub;
}
