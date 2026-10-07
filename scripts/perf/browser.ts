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
  const state = { fcp: null, lcp: null, tasks: [], appReady: null, content: null };
  window.__perf = state;
  const watch = (type, onEntry) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: true });
    } catch (e) { /* entry type unsupported: leave the metric null */ }
  };
  watch('paint', (e) => { if (e.name === 'first-contentful-paint') state.fcp = e.startTime; });
  watch('largest-contentful-paint', (e) => { state.lcp = e.startTime; });
  watch('longtask', (e) => { state.tasks.push({ startMs: e.startTime, durationMs: e.duration }); });
  // appReady: the first moment after the app has been on screen at all that
  // neither the static splash (#boot-splash, which Vue's mount removes) nor the
  // Vue loading screen that App.vue shows while auth and the campaign resolve
  // (.loading-screen) is in the DOM. Both have to be gone: the splash goes at
  // mount, long before there is anything to look at. Seen-first guards against
  // reading "absent" in the instant before the body has been parsed.
  let seenLoading = false;
  const loadingUp = () => !!document.querySelector('#boot-splash, .loading-screen');
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  // contentReady: when a journey-specific piece of real content is visible.
  // __perfWatchContent restarts it for a client-side navigation, with the clock
  // starting at the call (just before the click).
  const checkContent = () => {
    const c = state.content;
    if (!c || c.at !== null) return;
    const hit = [...document.querySelectorAll(c.selector)].some((el) => isVisible(el) && (!c.text || (el.textContent || '').includes(c.text)));
    if (hit) c.at = performance.now() - c.start;
  };
  const check = () => {
    if (state.appReady === null) {
      if (loadingUp()) seenLoading = true;
      else if (seenLoading) state.appReady = performance.now();
    }
    checkContent();
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });
  window.__perfWatchContent = (spec) => { state.content = { selector: spec.selector, text: spec.text || null, start: spec.fromNavigationStart ? 0 : performance.now(), at: null }; checkContent(); };
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
  /** Real content to wait for on the first load; see ContentSpec. */
  content?: ContentSpec;
}

/**
 * What "the page's real content is on screen" means for a journey: a CSS
 * selector that must match a visible element, and optionally text its content
 * must contain (for headings that share a selector with the previous page).
 */
export interface ContentSpec {
  selector: string;
  text?: string;
}

/** A context with the profile applied, one page, and a recorder attached before anything loads. */
export async function openMeasuredPage(browser: Browser, profile: Profile, opts: ContextOptions): Promise<MeasuredPage> {
  const context = await browser.newContext({ viewport: profile.viewport, storageState: opts.storageState });
  await context.addInitScript({ content: INIT_SCRIPT });
  if (opts.content !== undefined) {
    await context.addInitScript({ content: `window.__perfWatchContent({ ...${JSON.stringify(opts.content)}, fromNavigationStart: true });` });
  }
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
  // Below the routing layer, so it reaches the CORS preflights the hold above
  // cannot (see `ProfileRecord.latencyMs`). -1 leaves bandwidth unthrottled.
  if (opts.throttled && (profile.latencyMs ?? 0) > 0) {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: profile.latencyMs ?? 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  }
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
  appReady: number | null;
  content: { at: number | null } | null;
}

/** Starts timing a content selector now; used right before a client-side navigation. */
export async function watchContent(page: Page, spec: ContentSpec): Promise<void> {
  await page.evaluate(`window.__perfWatchContent(${JSON.stringify(spec)})`);
}

async function readPaint(page: Page): Promise<PaintReading> {
  const raw: unknown = await page.evaluate("window.__perf");
  if (typeof raw !== "object" || raw === null) throw new Error("window.__perf missing: the init script did not run");
  return raw as PaintReading;
}

/**
 * Closes a measurement window into a Sample. `kind: "load"` is a full page
 * load; "navigation" and "resume" are not, so FCP/LCP/TBT and appReady of the
 * original load would be reported against the wrong window and are left null.
 * Content readiness applies to loads and navigations (resume shows no new content).
 */
export async function collectSample(measured: MeasuredPage, kind: "load" | "navigation" | "resume"): Promise<Sample> {
  const { requests, startMs, endMs } = measured.recorder.snapshot();
  const network = summarizeRequests(requests, API_ORIGIN, startMs, endMs, QUIET_MS);
  if (kind === "resume") return { ...network, fcpMs: null, lcpMs: null, tbtMs: null, appReadyMs: null, contentReadyMs: null };
  const reading = await readPaint(measured.page);
  const contentReadyMs = reading.content === null ? null : reading.content.at;
  if (kind === "navigation") return { ...network, fcpMs: null, lcpMs: null, tbtMs: null, appReadyMs: null, contentReadyMs };
  return {
    ...network,
    fcpMs: reading.fcp,
    lcpMs: reading.lcp,
    tbtMs: totalBlockingTime(reading.tasks, reading.fcp),
    appReadyMs: reading.appReady,
    contentReadyMs,
  };
}

/** Waits for the page to go quiet; a timeout is reported on stderr so a never-settling page is not silently trusted. */
export async function settle(measured: MeasuredPage, what: string, minWaitMs = 1000): Promise<void> {
  const { timedOut } = await measured.recorder.waitForIdle({ quietMs: QUIET_MS, minWaitMs, timeoutMs: 30_000 });
  if (timedOut) console.warn(`warning: ${what} had not been idle for ${QUIET_MS}ms after 30s; numbers include a busy network`);
}
