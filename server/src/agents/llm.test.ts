import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouterBrain } from './llm.js';
import type { DirectorContext } from './types.js';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const context: DirectorContext = { now: 100_000, cops: [], suspects: [] };
describe('OpenRouter budget and validation', () => {
  it('honors interval and per-minute caps and uses escalation only when requested', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: '{"action":"patrol"}' } }] }) });
    vi.stubGlobal('fetch', fetcher);
    const brain = new OpenRouterBrain({ apiKey: 'test', model: 'routine', escalationModel: 'stronger', minIntervalMs: 6000, maxCallsPerMinute: 8 });
    await brain.decide(context); await brain.decide(context);
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 8; i++) { vi.setSystemTime(106_000 + i * 6000); await brain.decide({ ...context, escalate: true }); }
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).model).toBe('routine');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).model).toBe('stronger');
    vi.setSystemTime(160_001); await brain.decide(context);
    expect(fetcher).toHaveBeenCalledTimes(9);
  });
  it('rejects actions outside the closed goal set and falls back on network failure', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"action":"executeCode"}' } }] }) }).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetcher);
    const brain = new OpenRouterBrain({ apiKey: 'test', model: 'routine', minIntervalMs: 0, maxCallsPerMinute: 8 });
    expect(await brain.decide(context)).toBeNull();
    expect(await brain.decide(context)).toBeNull();
  });
});
