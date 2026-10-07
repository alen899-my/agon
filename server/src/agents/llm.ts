/**
 * OpenRouter LLM brain: turns director context into a tactic goal.
 *
 * Non-streaming chat completion, JSON-only reply, hard timeout, per-room call
 * budget. Any failure (no key, timeout, bad JSON, over budget) resolves null
 * so the director falls back to the scripted dispatcher — the cop never stalls.
 */
import { getCharacter } from './characters.js';
import { generateGemini } from './gemini.js';
import { candidateModels } from './provider.js';
import type { AgentGoal, AgentGoalAction, Brain, DirectorContext } from './types.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const CALL_TIMEOUT_MS = 10_000;

export interface OpenRouterOptions {
  provider?: 'gemini' | 'openrouter';
  apiKey: string;
  model: string;
  escalationModel?: string;
  minIntervalMs: number;
  maxCallsPerMinute: number;
  siteUrl?: string;
  siteName?: string;
  reasoning?: boolean;
}

export function sanitizeGoal(raw: unknown, allowed: AgentGoalAction[]): AgentGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.action !== 'string' || !allowed.includes(g.action as AgentGoalAction)) return null;
  const goal: AgentGoal = { action: g.action as AgentGoalAction };
  if (typeof g.suspectId === 'string' && g.suspectId.length > 0 && g.suspectId.length <= 100) {
    goal.suspectId = g.suspectId;
  }
  if (Number.isFinite(g.x) && Number.isFinite(g.z)) {
    goal.x = Math.max(-160, Math.min(160, g.x as number));
    goal.z = Math.max(-160, Math.min(160, g.z as number));
  }
  if (goal.action === 'pursue' && !goal.suspectId) return null;
  if (goal.action === 'roadblock' && (goal.x === undefined || goal.z === undefined)) return null;
  const rawDirectives = g.directives;
  if (rawDirectives && typeof rawDirectives === 'object') {
    const d = rawDirectives as Record<string, unknown>;
    const directives: NonNullable<AgentGoal['directives']> = {};
    if (typeof d.siteFocus === 'string' && /^lot-\d+$/.test(d.siteFocus)) directives.siteFocus = d.siteFocus;
    if (typeof d.raceNow === 'boolean') directives.raceNow = d.raceNow;
    if (Object.keys(directives).length > 0) goal.directives = directives;
  }
  return goal;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in reply');
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

function buildPrompt(ctx: DirectorContext): { system: string; user: string } {
  const role = getCharacter('police');
  const system =
    'You are a GTA-style police dispatcher for a multiplayer open-world driving game. ' +
    'Reply with ONE JSON object only: {"action":"patrol"|"pursue"|"roadblock"|"standDown","suspectId":"...","x":0,"z":0}. ' +
    'pursue needs suspectId. roadblock needs x,z ahead of the suspect. ' +
    (role ? role.systemPrompt : '');
  const lines = ctx.suspects.map((s) =>
    `- suspect ${s.name} (${s.playerId}): wanted=${s.wanted} at (${s.x.toFixed(0)},${s.z.toFixed(0)}) ` +
    `speed=${s.speed.toFixed(1)}m/s ${s.driving ? 'driving' : 'on foot'} lastCrime=${Math.round((ctx.now - s.lastCrimeAt) / 1000)}s ago`,
  );
  const cop = ctx.cops[0];
  const user =
    `Cruiser: ${cop ? `${cop.mode} at (${cop.x.toFixed(0)},${cop.z.toFixed(0)})` : 'not spawned'}. ` +
    (lines.length > 0 ? `Suspects:\n${lines.join('\n')}` : 'No suspects. Order patrol or standDown.') +
    (ctx.world ? `\nWorld: ${ctx.world}` : '') +
    (ctx.rides && ctx.rides.length > 0 ? `\nStreet race: ${ctx.rides.map(r => `${r.name} lap ${r.lap} (${r.state})`).join(', ')}` : '') +
    '\nOptional "directives": {"siteFocus":"lot-1"|"lot-2"} to steer builders, {"raceNow":true} to start Maya vs Leo.';
  return { system, user };
}

export class OpenRouterBrain implements Brain {
  get name(): string { return this.opts.provider ?? 'openrouter'; }
  private lastCallAt = -Infinity;
  private callStamps: number[] = [];
  /** Last prompt/goal pair (replay + debugging). */
  lastExchange: { prompt: string; goal: AgentGoal | null; at: number } | null = null;

  constructor(private readonly opts: OpenRouterOptions) {}

  get configured(): boolean {
    return this.opts.apiKey.length > 0;
  }

  private budgetOk(now: number): boolean {
    if (now - this.lastCallAt < this.opts.minIntervalMs) return false;
    this.callStamps = this.callStamps.filter((t) => now - t < 60_000);
    return this.callStamps.length < this.opts.maxCallsPerMinute;
  }

  async decide(ctx: DirectorContext): Promise<AgentGoal | null> {
    const now = Date.now();
    if (!this.configured || !this.budgetOk(now)) return null;
    const { system, user } = buildPrompt(ctx);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
    this.lastCallAt = now;
    this.callStamps.push(now);
    try {
      if (this.opts.provider === 'gemini') {
        const allowed = getCharacter('police')?.goals ?? ['patrol', 'pursue', 'roadblock', 'standDown'];
        // Best-model chain: primary lite → escalation Flash (when hot) → lite
        // fallback. A 429/503 on one model falls through to the next instead
        // of silently dropping to scripted.
        for (const model of candidateModels(this.opts, !!ctx.escalate)) {
          const content = await generateGemini({ ...this.opts, model }, system, user, 0.3, 512, ctrl.signal);
          if (!content) {
            if (ctrl.signal.aborted) return null;
            continue;
          }
          try {
            const goal = sanitizeGoal(extractJson(content), allowed);
            this.lastExchange = { prompt: user, goal, at: now }; return goal;
          } catch { continue; }
        }
        return null;
      }
      const body: Record<string, unknown> = {
        model: ctx.escalate && this.opts.escalationModel ? this.opts.escalationModel : this.opts.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 160,
        temperature: 0.3,
      };
      // Reasoning models: request visible thinking (non-streaming still returns it).
      if (this.opts.reasoning) body.reasoning = { enabled: true };
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.opts.apiKey}`,
          ...(this.opts.siteUrl ? { 'HTTP-Referer': this.opts.siteUrl } : {}),
          ...(this.opts.siteName ? { 'X-Title': this.opts.siteName } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) return null;
      const allowed = getCharacter('police')?.goals ?? ['patrol', 'pursue', 'roadblock', 'standDown'];
      const goal = sanitizeGoal(extractJson(content), allowed);
      this.lastExchange = { prompt: user, goal, at: now };
      return goal;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}
