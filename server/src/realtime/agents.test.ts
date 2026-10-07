import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../services/rooms.service.js', () => ({
  MAX_ROOM_MEMBERS: 100, ROOM_TTL_HOURS: 24, getMembership: vi.fn(), getRoom: vi.fn(),
  normalizeRoomCode: vi.fn(), touchRoomActivity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../agents/buildings.js', () => ({ loadBuildings: vi.fn(), saveBuilding: vi.fn().mockResolvedValue(undefined) }));
import { loadBuildings, saveBuilding } from '../agents/buildings.js';
import { RoomHub, type MemberState } from './hub.js';
import type { AgentDirector } from '../agents/director.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('room world authority', () => {
  it('restores before ticking and shares identical stage deltas with both members', async () => {
    vi.useFakeTimers(); vi.stubEnv('AI_MODE', 'scripted');
    vi.mocked(loadBuildings).mockResolvedValue([{ siteId: 'lot-1', stage: 2 }]);
    const hub = new RoomHub();
    const internals = hub as unknown as { rooms: Map<string, Map<string, MemberState>>; ensureAgents(code: string): void; directors: Map<string, { director: AgentDirector }> };
    const outputs: any[][] = [[], []];
    const room = new Map<string, MemberState>();
    outputs.forEach((out, i) => room.set(String(i), { helloed: true, ws: { OPEN: 1, readyState: 1, send: (text: string) => out.push(JSON.parse(text)) } } as unknown as MemberState));
    internals.rooms.set('TEST01', room); internals.ensureAgents('TEST01');
    await vi.advanceTimersByTimeAsync(600);
    for (const out of outputs) expect(out.find(m => m.t === 'agent_state').a.sites[0].stage).toBe(2);
    const d = internals.directors.get('TEST01')!.director;
    d.world.construction.build(d.world.blackboard.sites[0], 20, false);
    await vi.advanceTimersByTimeAsync(500);
    const first = outputs[0].find(m => m.t === 'build_delta');
    expect(first.delta).toMatchObject({ siteId: 'lot-1', stage: 3, box: { h: 6 } });
    expect(outputs[1].find(m => m.t === 'build_delta')).toEqual(first);
    expect(saveBuilding).toHaveBeenCalledWith('TEST01', first.delta);
    room.clear(); await vi.advanceTimersByTimeAsync(200);
    expect(internals.directors.size).toBe(0);
  });
});
