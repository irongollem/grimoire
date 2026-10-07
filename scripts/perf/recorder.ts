import type { CDPSession } from "playwright";
import type { RawRequest } from "./summarize";

interface RequestWillBeSent {
  requestId: string;
  type?: string;
  timestamp: number;
  wallTime: number;
  request: { url: string; method: string };
  redirectResponse?: unknown;
}
interface LoadingFinished {
  requestId: string;
  timestamp: number;
  encodedDataLength: number;
}
interface LoadingFailed {
  requestId: string;
  timestamp: number;
}

/**
 * Records every request the page makes through the DevTools protocol rather
 * than Playwright's `page.on("request")`. The protocol is the only one of the
 * two that reports CORS preflights (`type: "Preflight"`), which is what lets the
 * harness count `OPTIONS` separately from real requests (the #945 trap), and it
 * carries byte counts (`encodedDataLength`) and a monotonic clock.
 *
 * Request times arrive on Chromium's monotonic clock; `wallTime` on the same
 * event pairs that clock with the wall clock, which is how `reset()`'s
 * "now" is expressed on the request clock.
 */
export class NetworkRecorder {
  private requests = new Map<string, RawRequest>();
  /** wall ms minus monotonic ms, learned from the first event; null until a request is seen. */
  private wallMinusMonoMs: number | null = null;
  private windowStartWallMs = Date.now();
  private inFlight = new Set<string>();
  private lastActivityWallMs = Date.now();

  private constructor(private readonly cdp: CDPSession) {}

  static async attach(cdp: CDPSession): Promise<NetworkRecorder> {
    const recorder = new NetworkRecorder(cdp);
    cdp.on("Network.requestWillBeSent", (e: RequestWillBeSent) => recorder.onStart(e));
    cdp.on("Network.loadingFinished", (e: LoadingFinished) => recorder.onEnd(e.requestId, e.timestamp, e.encodedDataLength));
    cdp.on("Network.loadingFailed", (e: LoadingFailed) => recorder.onEnd(e.requestId, e.timestamp, 0));
    await cdp.send("Network.enable");
    return recorder;
  }

  /** Opens a fresh measurement window: forgets everything seen so far. */
  reset(): void {
    this.requests.clear();
    this.inFlight.clear();
    this.windowStartWallMs = Date.now();
    this.lastActivityWallMs = this.windowStartWallMs;
  }

  /** Milliseconds since the last request started or finished, 0 while any is in flight. */
  idleForMs(): number {
    return this.inFlight.size > 0 ? 0 : Date.now() - this.lastActivityWallMs;
  }

  /** The window as request-clock milliseconds: where it opened, where it is now, and what was seen. */
  snapshot(): { requests: RawRequest[]; startMs: number; endMs: number } {
    const offset = this.wallMinusMonoMs;
    if (offset === null) return { requests: [], startMs: 0, endMs: 0 };
    return {
      requests: [...this.requests.values()],
      startMs: this.windowStartWallMs - offset,
      endMs: Date.now() - offset,
    };
  }

  private onStart(e: RequestWillBeSent): void {
    this.wallMinusMonoMs = e.wallTime * 1000 - e.timestamp * 1000;
    this.lastActivityWallMs = Date.now();
    const existing = this.requests.get(e.requestId);
    if (existing !== undefined && e.redirectResponse !== undefined) {
      // A redirect re-announces the same id: one logical request, keep its start.
      existing.url = e.request.url;
      return;
    }
    this.requests.set(e.requestId, {
      url: e.request.url,
      method: e.request.method,
      resourceType: e.type ?? "Other",
      startMs: e.timestamp * 1000,
      endMs: null,
      encodedBytes: 0,
    });
    // A preflight is not page work and may never report a finish of its own.
    if (e.type !== "Preflight" && /^https?:/.test(e.request.url)) this.inFlight.add(e.requestId);
  }

  private onEnd(requestId: string, timestamp: number, encodedBytes: number): void {
    this.lastActivityWallMs = Date.now();
    this.inFlight.delete(requestId);
    const request = this.requests.get(requestId);
    if (request === undefined) return;
    request.endMs = timestamp * 1000;
    request.encodedBytes = encodedBytes;
  }

  /** Polls until the network has been quiet for `quietMs`, or gives up at `timeoutMs`. */
  async waitForIdle(opts: { quietMs: number; minWaitMs: number; timeoutMs: number }): Promise<{ timedOut: boolean }> {
    const begin = Date.now();
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const elapsed = Date.now() - begin;
      if (elapsed >= opts.timeoutMs) return { timedOut: true };
      if (elapsed >= opts.minWaitMs && this.idleForMs() >= opts.quietMs) return { timedOut: false };
    }
  }

  async dispose(): Promise<void> {
    await this.cdp.detach().catch(() => undefined);
  }
}
