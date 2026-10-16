/** Fixed simulation steps with interpolated rendering; no background catch-up. */
export class GameLoop {
  private frame: number | null = null;
  private last: number | null = null;
  private accumulator = 0;
  readonly step = 1 / 60;
  constructor(private update: (dt: number) => void, private render: (alpha: number) => void) {}
  start(): void {
    if (this.frame !== null) return;
    this.last = null;
    this.frame = requestAnimationFrame(this.tick);
  }
  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.last = null;
    this.accumulator = 0;
  }
  private tick = (now: number): void => {
    const elapsed = this.last === null ? 0 : Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.accumulator += elapsed;
    // Bound catch-up work so a slow frame cannot cause an escalating input/render backlog.
    let steps = 0;
    while (this.accumulator >= this.step && steps < 4) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    if (this.accumulator >= this.step) this.accumulator %= this.step;
    this.render(Math.max(0, Math.min(1, this.accumulator / this.step)));
    this.frame = requestAnimationFrame(this.tick);
  };
}
