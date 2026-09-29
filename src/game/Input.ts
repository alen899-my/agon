import type { Action } from './State';

/** Each finger/key owns a source; releasing one never releases another. */
export class Input {
  private sources = new Map<string, Action>();
  private edges = new Set<Action>();
  set(action: Action, down: boolean, source: string): void {
    if (down) {
      if (!this.sources.has(source) && !this.held(action)) this.edges.add(action);
      this.sources.set(source, action);
    } else this.sources.delete(source);
  }
  held(action: Action): boolean { return [...this.sources.values()].includes(action); }
  consume(action: Action): boolean { const pressed = this.edges.has(action); this.edges.delete(action); return pressed; }
  clear(): void { this.sources.clear(); this.edges.clear(); }
}
