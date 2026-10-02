import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/rooms.service.js', () => ({
  MAX_ROOM_MEMBERS: 16, ROOM_TTL_HOURS: 24, deleteRoom: vi.fn(),
  getMembership: vi.fn(), getRoom: vi.fn(), normalizeRoomCode: vi.fn(), touchRoomActivity: vi.fn(),
}));
import { RoomHub, type MemberState } from './hub.js';
import type { RacePosPayload, RaceSnapshotMsg } from './protocol.js';

function setup() {
  const hub = new RoomHub();
  const room = new Map<string, MemberState>();
  const messages = new Map<string, Record<string, unknown>[]>();
  for (const id of ['a', 'b', 'guest', 'bystander']) {
    const out: Record<string, unknown>[] = [];
    messages.set(id, out);
    room.set(id, { playerId: id, name: id, helloed: true, roomCode: 'ABCDEF',
      role: 'member', pos: null, alive: true, msgStamps: [],
      ws: { OPEN: 1, readyState: 1, send: (s: string) => out.push(JSON.parse(s)) } as unknown as MemberState['ws'],
    });
  }
  (hub as unknown as { rooms: Map<string, Map<string, MemberState>> }).rooms.set('ABCDEF', room);
  return { hub, member: (id: string) => room.get(id)!, messages };
}
const progress = (hostId: string): RacePosPayload => ({ hostId, lap: 1, cp: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0, vehicleKind: 'car', ready: false, blinker: 0 });
const snapshot = (id: string, guests: string[] = []): RaceSnapshotMsg => ({
  sentAt: 1000, phase: 'lobby', laps: 3, countdownEndsAt: 0, startedAt: 0,
  racers: [id, ...guests].map(id => ({ id, name: id, ready: true, vehicleKind: 'car', lap: 1, checkpoint: 0, dist: 0, finished: false, finishMs: 0, bestLapMs: 0 })),
});

describe('race routing', () => {
  it('routes a join only to its selected host and snapshots only to participants', () => {
    const { hub, member, messages } = setup();
    hub.onRaceState(member('a'), snapshot('a'));
    hub.onRaceState(member('b'), snapshot('b'));
    hub.onRacePos(member('guest'), progress('a'));
    expect(messages.get('a')!.filter(m => m.t === 'race_pos')).toHaveLength(1);
    expect(messages.get('b')!.filter(m => m.t === 'race_pos')).toHaveLength(0);
    hub.onRaceState(member('a'), snapshot('a', ['guest']));
    expect(messages.get('guest')!.filter(m => m.t === 'race_state')).toHaveLength(1);
    expect(messages.get('bystander')!.filter(m => m.t === 'race_state')).toHaveLength(0);
  });
  it('requires opt-in and rejects malformed or forged host snapshots', () => {
    const { hub, member, messages } = setup();
    hub.onRaceState(member('a'), snapshot('a', ['bystander']));
    hub.onRaceState(member('b'), snapshot('a'));
    hub.onRaceState(member('a'), { ...snapshot('a'), racers: [null] });
    hub.onRaceList(member('guest'));
    expect(messages.get('guest')!.at(-1)?.races).toEqual([]);
  });
  it('removes a closed lobby and lets a participant join another race', () => {
    const { hub, member, messages } = setup();
    hub.onRaceState(member('a'), snapshot('a'));
    hub.onRaceState(member('b'), snapshot('b'));
    hub.onRacePos(member('guest'), progress('a'));
    hub.onRaceState(member('a'), { ...snapshot('a'), phase: 'idle', racers: [] });
    hub.onRacePos(member('guest'), progress('b'));
    expect(messages.get('b')!.filter(m => m.t === 'race_pos')).toHaveLength(1);
    hub.onRaceList(member('bystander'));
    expect(messages.get('bystander')!.at(-1)?.races).toEqual([expect.objectContaining({ hostId: 'b' })]);
  });
  it('rejects late joins with an actionable error', () => {
    const { hub, member, messages } = setup();
    hub.onRaceState(member('a'), { ...snapshot('a'), phase: 'racing' });
    hub.onRacePos(member('guest'), progress('a'));
    expect(messages.get('guest')!.at(-1)).toMatchObject({ t: 'error', code: 'race_join_failed' });
  });
});
