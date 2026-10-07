/**
 * ScriptedDispatcher: deterministic fallback brain.
 *
 * Used when the LLM is missing/slow/over-budget, when AI_MODE=scripted, and
 * as the embedded brain for solo mode. Same goal interface as the LLM brain.
 */
import type { AgentGoal, Brain, DirectorContext } from './types.js';

export class ScriptedDispatcher implements Brain {
  readonly name = 'scripted';

  async decide(ctx: DirectorContext): Promise<AgentGoal | null> {
    const cop = ctx.cops[0];
    if (!cop) return null;
    const active = ctx.suspects
      .filter((s) => s.wanted > 0)
      .sort((a, b) => b.wanted - a.wanted || b.lastCrimeAt - a.lastCrimeAt)[0];
    if (!active) {
      // Nothing to do: patrol while out, stand down once back at post.
      if (cop.mode === 'patrol' || cop.mode === 'return') return null;
      return { action: 'standDown' };
    }
    // Already on this suspect: keep going (null = hold current goal).
    if (cop.suspectId === active.playerId && (cop.mode === 'pursue' || cop.mode === 'respond')) return null;
    // Long stale chase on a fast driver: cut them off instead of tailing.
    if (active.driving && active.speed > 20 && ctx.now - active.lastCrimeAt > 30_000) {
      return { action: 'roadblock', x: active.x, z: active.z };
    }
    return { action: 'pursue', suspectId: active.playerId };
  }
}
