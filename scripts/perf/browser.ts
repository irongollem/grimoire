import type { Browser, BrowserContext, Page } from "playwright";
import { NetworkRecorder } from "./recorder";
import type { ProfileRecord, Sample } from "./results";
import { summarizeRequests, totalBlockingTime, type LongTask } from "./summarize";

export const API_ORIGIN = "http://127.0.0.1:54321";
export const QUIET_MS = 500;

export interface Profile extends ProfileRecord {
  apiOrigin: string;
}

/**
 * Runs in every page before the app: records paint and long-task entries (the
 * buffered flag matters, the app's first paint can precede this observer's
 * first callback), and installs two test seams the `resume` journey drives:
 * `__perfAdvanceClock(ms)` shifts `Date.now()` forward and
 * `__perfSetVisibility(state)` flips `document.visibilityState` and fires
 * `visibilitychange`. The app's wake logic (`createRealtimeHeal`) measures the
 * hidden window with `Date.now()`, so a shifted clock is the whole of "hidden
 * for 61 seconds" without anyone waiting 61 seconds.
 */
const INIT_SCRIPT = `(() => {
  const state = { fcp: null, lcp: null, tasks: [] };
  window.__perf = state;
  const watch = (type, onEntry) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    } catch (e) { /* entry type unsupported: leave the metric null */ }
  };
  watch('paint', (e) => { if (e.name === 'first-contentful-paint') state.fcp = e.startTime; });
  watch('largest-contentful-paint', (e) => { state.lcp = e.startTime; });
  watch('longtask', (e) => { state.tasks.push({ startMs: e.startTime, durationMs: e.duration }); });
  let offset = 0;
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + offset;
  window.__perfAdvanceClock = (ms) => { offset += ms; };
  let visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => visibility === 'hidden' });
  window.__perfSetVisibility = (next) => { visibility = next; document.dispatchEvent(new Event('visibilitychange')); };
})();`;

export interface MeasuredPage {
  context: BrowserContext;
  page: Page;
  recorder: NetworkRecorder;
}

export interface ContextOptions {
  storageState?: Awaited<ReturnType<BrowserContext["storageState"]>>;
  /** Apply CPU throttle and API delay. Sign-in runs unthrottled: it is setup, not a measurement. */
  throttled: boolean;
}

/** A context with the profile applied, one page, and a recorder attached before anything loads. */
export async function openMeasuredPage(browser: Browser, profile: Profile, opts: ContextOptions): Promise<MeasuredPage> {
  const context = await browser.newContext({ viewport: profile.viewport, storageState: opts.storageState });
  await context.addInitScript({ content: INIT_SCRIPT });
  if (opts.throttled && profile.apiDelayMs > 0) {
    // The #945 method: hold every API request for a fixed time so a request that
    // waits on another shows up as a visible wave instead of vanishing into a
    // sub-millisecond localhost round trip.
    await context.route(`${profile.apiOrigin}/**`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, profile.apiDelayMs));
      await route.continue();
    });
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const recorder = await NetworkRecorder.attach(cdp);
  if (opts.throttled) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottle });
  // Playwright turns the HTTP cache off while a route is installed. That would
  // make every warm journey re-download its assets and measure a cache that
  // does not exist for a real returning user, so it is switched back on.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
  return { context, page, recorder };
}

interface PaintReading {
  fcp: number | null;
  lcp: number | null;
  tasks: LongTask[];
}

async function readPaint(page: Page): Promise<PaintReading> {
  const raw: unknown = await page.evaluate("window.__perf");
  if (typeof raw !== "object" || raw === null) throw new Error("window.__perf missing: the init script did not run");
  return raw as PaintReading;
}

/**
 * Closes a measurement window into a Sample. `paint: false` for windows that
 * are not a page load (client-side navigation, resume), where FCP/LCP/TBT of
 * the original load would be reported against the wrong window and are left null.
 */
export async function collectSample(measured: MeasuredPage, paint: boolean): Promise<Sample> {
  const { requests, startMs, endMs } = measured.recorder.snapshot();
  const network = summarizeRequests(requests, API_ORIGIN, startMs, endMs, QUIET_MS);
  if (!paint) return { ...network, fcpMs: null, lcpMs: null, tbtMs: null };
  const reading = await readPaint(measured.page);
  return { ...network, fcpMs: reading.fcp, lcpMs: reading.lcp, tbtMs: totalBlockingTime(reading.tasks, reading.fcp) };
}

/** Waits for the page to go quiet; a timeout is reported on stderr so a never-settling page is not silently trusted. */
export async function settle(measured: MeasuredPage, what: string, minWaitMs = 1000): Promise<void> {
  const { timedOut } = await measured.recorder.waitForIdle({ quietMs: QUIET_MS, minWaitMs, timeoutMs: 30_000 });
  if (timedOut) console.warn(`warning: ${what} had not been idle for ${QUIET_MS}ms after 30s; numbers include a busy network`);
}
