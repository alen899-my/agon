import { describe, expect, it } from 'vitest';
import { TableTennisSim, TT } from './TableTennis';

const tick = (s: TableTennisSim, n = 60) => { for (let i = 0; i < n; i++) s.update(1 / 60); };

describe('table tennis physics', () => {
  it('loses height on table bounce (restitution < 1)', () => {
    const s = new TableTennisSim();
    s.phase = 'rally'; s.lastHitter = 'ai';
    s.ball = { x: 0, y: TT.H + 0.6, z: 0.5 }; s.vel = { x: 0, y: -3, z: 0.5 };
    let minVy = 0, bounced = false, vyAfter = 0;
    for (let i = 0; i < 240; i++) {
      s.update(1 / 240);
      if (!bounced) {
        minVy = Math.min(minVy, s.vel.y);
        if (s.vel.y > 0 && s.ball.y >= TT.H) { bounced = true; vyAfter = s.vel.y; }
      }
    }
    expect(bounced).toBe(true);
    expect(Math.abs(vyAfter)).toBeLessThan(Math.abs(minVy)); // energy lost
  });
  it('topspin dips faster than backspin (Magnus)', () => {
    const mk = (spin: number) => {
      const s = new TableTennisSim();
      s.phase = 'rally'; s.lastHitter = null; // free flight, no rulings
      s.ball = { x: 0, y: 1.6, z: 1.2 }; s.vel = { x: 0, y: 0.5, z: -4 }; s.spin = spin;
      return s;
    };
    const top = mk(3.2), back = mk(-2.6);
    // Sample mid-flight (15 frames) before either ball reaches the table.
    for (let i = 0; i < 15; i++) { top.update(1 / 60); back.update(1 / 60); }
    expect(top.ball.y).toBeGreaterThan(TT.H + 0.1); // still airborne
    expect(back.ball.y).toBeGreaterThan(TT.H + 0.1);
    expect(top.ball.y).toBeLessThan(back.ball.y);
  });
  it('serve → rally → point flow and win-by-2', () => {
    const s = new TableTennisSim();
    expect(s.phase).toBe('serve');
    expect(s.swingPlayer('serve')).toBe(true);
    expect(s.phase).toBe('rally');
    s.awardPoint('you', 'test');
    expect(s.you).toBe(1); expect(s.phase).toBe('point');
    tick(s, 120); // point timer elapses → next serve
    expect(s.phase).toBe('serve');
    s.you = 10; s.aiScore = 10;
    s.awardPoint('you', 't');
    expect(s.phase).toBe('point'); // 11-10 not enough
    tick(s, 120);
    s.lastHitter = 'you'; s.bouncesThisShot = 0;
    s.awardPoint('you', 't');
    expect(s.phase).toBe('over'); expect(s.winner).toBe('you');
  });
  it('net blocks low shots', () => {
    const s = new TableTennisSim(); s.phase = 'rally'; s.lastHitter = 'you';
    // Skimming just under the tape, crossing the net plane while still airborne.
    s.ball = { x: 0, y: TT.H + 0.19, z: 0.1 }; s.vel = { x: 0, y: -2, z: -6 }; s.spin = 0;
    let netted = false;
    for (let i = 0; i < 60; i++) { s.update(1 / 60); if (s.events.some(e => e.kind === 'net')) { netted = true; break; } }
    expect(netted).toBe(true);
  });
  it('paddle reach gating prevents cross-net camping', () => {
    const s = new TableTennisSim(); s.phase = 'rally'; s.lastHitter = 'ai';
    s.ball = { x: 0, y: 1.0, z: -1.2 }; // deep on AI side
    expect(s.swingPlayer('drive')).toBe(false);
  });
});
