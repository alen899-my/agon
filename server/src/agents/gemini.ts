import { normalizeGeminiModel } from './provider.js';
import type { OpenRouterOptions } from './llm.js';

interface Usage { stamps: number[]; day: string; count: number; retryAt: number }
const usage = new Map<string, Usage>();
const status = { requests: 0, successes: 0, lastSuccessAt: 0, lastError: '' };
export function geminiStatus() { return { ...status }; }

/** Shared across dialogue, dispatch and rooms; never return provider error bodies or keys. */
export async function generateGemini(options: OpenRouterOptions, system: string, user: string, temperature: number, maxTokens: number, signal: AbortSignal): Promise<string | null> {
  if (!options.apiKey) { status.lastError = 'missing_key'; return null; }
  const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), model = normalizeGeminiModel(options.model) || options.model;
  let budget = usage.get(model);
  if (!budget || budget.day !== day) { budget = { stamps: [], day, count: 0, retryAt: 0 }; usage.set(model, budget); }
  budget.stamps = budget.stamps.filter(t => now - t < 60000);
  // Local guard stays just under the account ceilings so we rarely burn RPD:
  // lite models 15 RPM / 500 RPD, full Flash models 5 RPM / 20 RPD.
  const lite = model.includes('flash-lite');
  if (now < budget.retryAt || budget.stamps.length >= (lite ? 12 : 4) || budget.count >= (lite ? 450 : 18)) {
    status.lastError = 'quota_wait'; return null;
  }
  budget.stamps.push(now); budget.count++; status.requests++;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': options.apiKey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: Math.max(1024, maxTokens), responseMimeType: 'application/json',
          ...(model.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}) } }),
    });
    if (!response.ok) {
      if (response.status === 429) {
        status.lastError = 'provider_quota';
        budget.retryAt = now + Math.max(60000, Math.min(3600000, (Number(response.headers.get('retry-after')) || 60) * 1000));
      } else if (response.status === 503 || response.status === 500) {
        // High demand / transient backend fault: back off briefly, keep RPD.
        status.lastError = response.status === 503 ? 'model_overloaded' : `provider_http_${response.status}`;
        budget.retryAt = now + 30_000;
      } else if (response.status === 401 || response.status === 403) {
        status.lastError = 'key_rejected';
      } else if (response.status === 400 || response.status === 404) {
        // Bad model id or bad payload: do NOT retry-loop this model this minute.
        status.lastError = `provider_http_${response.status}`;
        budget.retryAt = now + 60_000;
      } else {
        status.lastError = `provider_http_${response.status}`;
      }
      console.warn(`[ai] Gemini ${model}: ${status.lastError}`);
      return null;
    }
    const body = await response.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[] };
    const candidate = body.candidates?.[0];
    const text = candidate?.content?.parts?.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text ?? '').join('').trim();
    if (!text || candidate?.finishReason === 'MAX_TOKENS') { status.lastError = 'empty_or_truncated_reply'; return null; }
    status.successes++; status.lastSuccessAt = now; status.lastError = '';
    return text;
  } catch { status.lastError = signal.aborted ? 'timeout' : 'network_error'; return null; }
}
