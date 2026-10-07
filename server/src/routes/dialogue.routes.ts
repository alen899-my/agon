import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { DialogueBrain } from '../agents/dialogue.js';
import { modelOptions } from '../agents/provider.js';
import { geminiStatus } from '../agents/gemini.js';
import { OpenRouterBrain } from '../agents/llm.js';

export const dialogueRouter = Router();
const contextSchema = z.object({
  participants: z.array(z.object({ id: z.string().max(80), name: z.string().max(40), role: z.string().max(30) })).length(2),
  situation: z.string().max(2000), history: z.array(z.string().max(120)).max(8),
});
// Options are built per request (not once at import) so rotating GEMINI_*
// env values and AI_MODE take effect without a server restart in dev.
function liveOptions() {
  return modelOptions(config as unknown as Record<string, unknown>);
}
dialogueRouter.get('/status', (_req, res) => {
  const options = liveOptions();
  res.json({ enabled: config.AI_MODE === 'llm', configured: !!options.apiKey, provider: options.provider, model: options.model, escalationModel: options.escalationModel ?? '', ...geminiStatus() });
});
const lastRequests = new Map<string, number>();
dialogueRouter.post('/', requireAuth, async (req, res) => {
  const context = contextSchema.safeParse(req.body);
  if (!context.success) { res.status(400).json({ error: { code: 'invalid_dialogue', message: 'Invalid conversation context.' } }); return; }
  const now = Date.now(), id = req.player!.id;
  for (const [key, at] of lastRequests) if (now - at > 60000) lastRequests.delete(key);
  if (now - (lastRequests.get(id) ?? -Infinity) < 15000) { res.status(429).json({ lines: null }); return; }
  lastRequests.set(id, now);
  const options = liveOptions();
  const brain = new DialogueBrain({ ...options, minIntervalMs: 1500, maxCallsPerMinute: 12 });
  const lines = await brain.generate(context.data);
  brain.dispose();
  res.json({ lines, available: config.AI_MODE === 'llm' && !!options.apiKey, status: geminiStatus() });
});

const suspectSchema = z.object({ playerId: z.string().max(100), name: z.string().max(40), x: z.number().min(-160).max(160), z: z.number().min(-160).max(160), speed: z.number().min(0).max(200), driving: z.boolean(), wanted: z.number().int().min(0).max(5), lastCrimeAt: z.number().finite(), lastKnownX: z.number().min(-160).max(160), lastKnownZ: z.number().min(-160).max(160) });
const dispatchSchema = z.object({ now: z.number().finite(), cops: z.array(z.object({ id: z.string().max(100), x: z.number().finite(), z: z.number().finite(), yaw: z.number().finite(), speed: z.number().finite(), mode: z.enum(['patrol', 'respond', 'pursue', 'arrest', 'return']), lightsOn: z.boolean(), suspectId: z.string().max(100).nullable() })).max(2), suspects: z.array(suspectSchema).max(8), world: z.string().max(2000).optional(), escalate: z.boolean().optional() });
dialogueRouter.post('/decide', requireAuth, async (req, res) => {
  const parsed = dispatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ goal: null }); return; }
  const now = Date.now(), key = `dispatch:${req.player!.id}`;
  for (const [id, at] of lastRequests) if (now - at > 60000) lastRequests.delete(id);
  if (now - (lastRequests.get(key) ?? -Infinity) < 6000) { res.status(429).json({ goal: null }); return; }
  lastRequests.set(key, now);
  const dispatcher = new OpenRouterBrain(liveOptions());
  const goal = await dispatcher.decide(parsed.data);
  res.json({ goal });
});
