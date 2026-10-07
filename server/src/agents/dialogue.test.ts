import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogueBrain } from './dialogue.js';
import { LivingWorld } from './livingWorld.js';
import type { DialogueContext } from './dialogueTypes.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const context: DialogueContext = { participants: [{ id: 'a', name: 'Vendor', role: 'vendor' }, { id: 'b', name: 'Customer', role: 'resident' }], situation: 'Rain beside a building site.', history: ['Vendor: The new roof leaks.'] };
const options = { apiKey: 'test', model: 'test-model', minIntervalMs: 15000, maxCallsPerMinute: 4 };
const input = { cops: [], members: [] };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
describe('generated dialogue', () => {
  it('sends the situation and memory to the model and enforces the call budget', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ lines: ['Rain again?', 'At least the new roof helps.'] }) } }] }) });
    vi.stubGlobal('fetch', fetcher);
    const brain = new DialogueBrain(options);
    expect(await brain.generate(context)).toEqual(['Rain again?', 'At least the new roof helps.']);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content).toBe(JSON.stringify(context));
    expect(await brain.generate(context)).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('returns silence for missing credentials, invalid model replies and network failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"lines":["only one"]}' } }] }) }).mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    expect(await new DialogueBrain({ ...options, apiKey: '' }).generate(context)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await new DialogueBrain(options).generate(context)).toBeNull();
    expect(await new DialogueBrain(options).generate(context)).toBeNull();
  });
  it('has no scripted dialogue when no model is available', () => {
    const world = new LivingWorld();
    for (let now = 100; now < 20000; now += 100) world.tick(0.1, now, input);
    expect(world.snapshot().some(p => p.say)).toBe(false);
  });
  it('starts replies on the simulation clock and remembers only spoken turns', async () => {
    const world = new LivingWorld();
    const generator = vi.fn(async () => ['The worksite is busy.', 'Will it open soon?', 'Let us ask the crew.']);
    world.dialogue = generator;
    // Epoch clock catches replies mistakenly treated as already expired.
    world.tick(0.1, 1700000000000, input); await flush();
    world.tick(0.1, 1700000000100, input);
    expect(world.snapshot().filter(p => p.say).map(p => p.say)).toEqual(['The worksite is busy.']);
    world.tick(0.1, 1700000003400, input);
    expect(world.snapshot().filter(p => p.say).map(p => p.say)).toEqual(['Will it open soon?']);
    for (let t = 1700000004000; t < 1700000140000; t += 1000) { world.tick(0.1, t, input); await flush(); }
    expect(generator.mock.calls.some(call => (call as unknown as [DialogueContext])[0].history.length > 0)).toBe(true);
  });
  it('discards a late reply after interruption or disposal', async () => {
    const world = new LivingWorld(); let resolve!: (value: string[]) => void;
    world.dialogue = () => new Promise(r => { resolve = r; });
    world.tick(0.1, 100, input); await flush();
    const listener = world.snapshot().find(p => p.task === 'listen')!;
    world.incident(listener.x, listener.z, 200); world.tick(0.1, 200, input);
    resolve(['A stale line.', 'A stale reply.']); await flush(); world.tick(0.1, 300, input);
    expect(world.snapshot().some(p => p.say)).toBe(false);
    world.dispose();
  });
});
