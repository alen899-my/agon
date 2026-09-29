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
    // At most six steps per frame: overload slows simulation instead of spiralling.
    let steps = 0;
    while (this.accumulator >= this.step && steps < 6) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }
    this.render(this.accumulator / this.step);
    this.frame = requestAnimationFrame(this.tick);
  };
}
