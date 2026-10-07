import type { OpenRouterOptions } from './llm.js';

/**
 * Best-model defaults, picked from the account quota table:
 * - Primary `gemini-3.5-flash-lite`: 15 RPM / 250K TPM / 500 RPD (highest
 *   throughput text-out model, cheapest per dispatch + dialogue turn).
 * - Escalation `gemini-3.8-flash`: 5 RPM / 250K TPM / 20 RPD (newest full
 *   Flash for multi-suspect / multi-arrest dispatch).
 * - Hard fallback `gemini-3.1-flash-lite`: same 15 RPM / 500 RPD ceiling as
 *   the primary, used when the primary is rate-limited or overloaded.
 */
export const BEST_PRIMARY_MODEL = 'gemini-3.5-flash-lite';
export const BEST_ESCALATION_MODEL = 'gemini-3.8-flash';
export const BEST_FALLBACK_MODEL = 'gemini-3.1-flash-lite';

/** Accepts `Gemini 3.5 Flash Lite`, `gemini_3.5_flash_lite`, etc. */
export function normalizeGeminiModel(raw: unknown): string {
  const text = String(raw ?? '').trim().toLowerCase();
  if (!text) return '';
  const slug = text.replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '');
  // Already a full id (`gemini-3.5-flash-lite`, `gemma-...`, `gemini-...`).
  if (/^(gemini|gemma|veo|lyria|deep-research|antigravity)-/.test(slug)) return slug;
  // Bare version shorthands.
  if (/^3\.5-flash-lite$/.test(slug)) return 'gemini-3.5-flash-lite';
  if (/^3\.1-flash-lite$/.test(slug)) return 'gemini-3.1-flash-lite';
  if (/^3\.8-flash$/.test(slug)) return 'gemini-3.8-flash';
  if (/^3-flash$/.test(slug)) return 'gemini-3-flash';
  return slug;
}

export function modelOptions(env: Record<string, unknown> = process.env): OpenRouterOptions {
  const provider = env.AI_PROVIDER === 'openrouter' ? 'openrouter' : 'gemini';
  const primary = normalizeGeminiModel(env.GEMINI_MODEL) || BEST_PRIMARY_MODEL;
  const escalation = normalizeGeminiModel(env.GEMINI_ESCALATION_MODEL) || BEST_ESCALATION_MODEL;
  return {
    provider, apiKey: env.AI_MODE === 'scripted' ? '' : String((provider === 'gemini' ? env.GEMINI_API_KEY : env.OPENROUTER_API_KEY) ?? ''),
    model: String((provider === 'gemini' ? primary : env.OPENROUTER_MODEL) || (provider === 'gemini' ? BEST_PRIMARY_MODEL : 'openrouter/free')),
    escalationModel: String((provider === 'gemini' ? escalation : env.OPENROUTER_ESCALATION_MODEL) || ''),
    minIntervalMs: 6000, maxCallsPerMinute: 8,
  };
}

/** Ordered candidates for one decision: primary → escalation (if asked) → lite fallback. */
export function candidateModels(opts: OpenRouterOptions, escalate: boolean): string[] {
  const out: string[] = [];
  const push = (m: string | undefined): void => {
    const name = normalizeGeminiModel(m) || (opts.provider === 'gemini' ? '' : String(m ?? ''));
    if (name && !out.includes(name)) out.push(name);
  };
  if (opts.provider !== 'gemini') {
    if (opts.model) out.push(opts.model);
    if (escalate && opts.escalationModel) out.push(opts.escalationModel);
    return out;
  }
  push(opts.model || BEST_PRIMARY_MODEL);
  if (escalate) push(opts.escalationModel || BEST_ESCALATION_MODEL);
  push(BEST_FALLBACK_MODEL);
  // Escalation model is also worth trying as a last resort on routine calls
  // when the lite models are both throttled (cheap: local quota guard runs first).
  push(opts.escalationModel || BEST_ESCALATION_MODEL);
  return out;
}
