/**
 * Runs an async task at most once at a time and at most every `minGapMs`.
 * Calls made while it runs collapse into a single re-run that reads the latest state —
 * so frequent changes (lyric lines) never pile up a backlog of Discord API calls.
 */
export class Coalescer {
  private running = false;
  private pending = false;
  private stopped = false;

  constructor(
    private readonly task: () => Promise<void>,
    private readonly minGapMs: number,
  ) {}

  trigger(): void {
    if (this.stopped) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    void this.loop();
  }

  stop(): void {
    this.stopped = true;
    this.pending = false;
  }

  private async loop(): Promise<void> {
    this.running = true;
    do {
      this.pending = false;
      const started = Date.now();
      try {
        await this.task();
      } catch (err) {
        console.warn("[coalesce] task failed:", (err as Error).message);
      }
      const wait = this.minGapMs - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    } while (this.pending && !this.stopped);
    this.running = false;
  }
}
