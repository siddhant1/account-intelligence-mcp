/**
 * Fixed-window counter of failed authentication attempts per client IP.
 * Only failures are counted, so legitimate bursts of traffic are never
 * throttled by this limiter (that is the per-key rate limiter's job).
 */
export class FailedAuthLimiter {
  private readonly windows = new Map<string, { failures: number; resetAt: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until `ip` may try again, or 0 if it is not blocked. */
  retryAfterSeconds(ip: string): number {
    const window = this.current(ip);
    return window && window.failures >= this.maxFailures ? Math.ceil((window.resetAt - this.now()) / 1000) : 0;
  }

  recordFailure(ip: string): void {
    const window = this.current(ip);
    if (window) window.failures += 1;
    else this.windows.set(ip, { failures: 1, resetAt: this.now() + this.windowMs });
    if (this.windows.size > 10_000) this.prune();
  }

  private current(ip: string) {
    const window = this.windows.get(ip);
    if (window && window.resetAt <= this.now()) {
      this.windows.delete(ip);
      return undefined;
    }
    return window;
  }

  private prune(): void {
    const now = this.now();
    for (const [ip, window] of this.windows) if (window.resetAt <= now) this.windows.delete(ip);
  }
}
