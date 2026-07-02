export class GameTimer {
  private lastTime: number = 0;
  private accumulator: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount: number = 0;
  private tickTimeSum: number = 0;

  constructor(
    private readonly tickRate: number,
    private readonly onTick: (deltaMs: number) => void
  ) {}

  get avgTickTime(): number {
    return this.tickCount > 0 ? this.tickTimeSum / this.tickCount : 0;
  }

  get tps(): number {
    return this.tickRate;
  }

  start(): void {
    const intervalMs = 1000 / this.tickRate;
    this.lastTime = Date.now();

    this.timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastTime;
      this.lastTime = now;

      this.accumulator += elapsed;

      while (this.accumulator >= intervalMs) {
        const tickStart = Date.now();
        this.onTick(intervalMs);
        const tickDuration = Date.now() - tickStart;

        this.tickTimeSum += tickDuration;
        this.tickCount++;

        // 保留最近 100 次 tick 的统计
        if (this.tickCount > 100) {
          this.tickTimeSum = this.avgTickTime * 50;
          this.tickCount = 50;
        }

        this.accumulator -= intervalMs;
      }

      // 防止螺旋死亡：如果积累太多，直接丢弃
      if (this.accumulator > intervalMs * 5) {
        this.accumulator = 0;
      }
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
