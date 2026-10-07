import type { Browser } from "playwright";
import { collectSample, type ContentSpec, type MeasuredPage, openMeasuredPage, type Profile, settle, watchContent } from "./browser";
import type { Sample } from "./results";

export type StorageState = NonNullable<Parameters<Browser["newContext"]>[0]>["storageState"];
type StoredSession = Exclude<StorageState, string | undefined>;

export interface JourneyEnv {
  browser: Browser;
  base: string;
  profile: Profile;
  dm: StoredSession;
  /** null when the player fixture could not sign in. */
  player: StoredSession | null;
}

export interface Step {
  label: string;
  sample: Sample;
}

/** A journey that cannot run here; reported as skipped instead of failing the harness. */
export class JourneySkipped extends Error {}

export interface Journey {
  name: string;
  /** One run: returns one step per measurement window. */
  run: (env: JourneyEnv) => Promise<Step[]>;
}

export const DM_EMAIL = "perf-dm@example.invalid";
export const PLAYER_EMAIL = "perf-player@example.invalid";
const PASSWORD = "grimoire-perf-local";

/**
 * Signs in through the real /login form once and returns what a returning user
 * keeps between visits: cookies and localStorage (the Supabase session and the
 * auth snapshot of #945). IndexedDB and service workers are deliberately not in
 * Playwright's storage state, so a context built from it carries a session and
 * nothing else, which is exactly the "cold cache, known user" start.
 */
export async function signIn(browser: Browser, profile: Profile, base: string, email: string): Promise<StoredSession> {
  const measured = await openMeasuredPage(browser, profile, { throttled: false });
  try {
    const { page } = measured;
    await page.goto(`${base}/login`, { waitUntil: "load" });
    await page.locator('input[autocomplete="username"]').fill(email);
    await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
    // Let the post-login queries and the auth snapshot write finish before the
    // state is captured; a half-written session would make the first cold run unrepresentative.
    await settle(measured, `sign-in of ${email}`, 1500);
    return await measured.context.storageState();
  } finally {
    await measured.context.close();
  }
}

/**
 * What counts as "real content" per page, from the rendered DOM. The app has
 * no purpose-built hooks for this, so these are the most stable existing ones
 * (ids, test ids, a campaign-specific heading). A `data-perf="content"` attribute
 * on each view's main data region (dashboard widget grid, NPC grid, encounter
 * list, quest groups, Hearth body) would make these independent of markup and
 * class changes; until it exists a redesign of these elements means updating
 * this table.
 */
const CONTENT = {
  // A dashboard widget card heading: the widgets own their queries, so a
  // heading with a count in it ("Needs prep 1") is data, not chrome.
  dashboard: { selector: '[data-testid="page-body"] h2' },
  // An NPC card link; the Sets/Web tabs share the prefix and are chrome.
  "/npcs": { selector: 'main a[href^="/npcs/"]:not([href="/npcs/sets"]):not([href="/npcs/web"])' },
  // Weakest of the set: the fixture has no encounters and the view has no
  // list hook, so this is the page heading (matched by text, because the
  // previous page's heading also matches `main h1`).
  "/encounters": { selector: "main h1", text: "Encounters" },
  "/quests": { selector: "#quest-group-active" },
  hearth: { selector: ".hearth-title" },
} as const satisfies Record<string, ContentSpec>;

/**
 * How long a load window stays open at least. The app starts some background
 * work only after first paint and an idle moment (`afterFirstPaint`, timeout
 * 2000 ms), so a window that closes earlier would not count requests the load
 * still makes, only later, and the next journey step would be blamed for them.
 * Settled time is unaffected: it ignores activity after a quiet gap.
 */
const LOAD_WINDOW_MIN_MS = 3000;

async function loadAndMeasure(measured: MeasuredPage, url: string, label: string, reload: boolean): Promise<Step> {
  measured.recorder.reset();
  if (reload) await measured.page.reload({ waitUntil: "load" });
  else await measured.page.goto(url, { waitUntil: "load" });
  await settle(measured, label, LOAD_WINDOW_MIN_MS);
  return { label, sample: await collectSample(measured, "load") };
}

/** Gets a page onto the dashboard and idle, discarding what that cost. */
async function primeDashboard(measured: MeasuredPage, base: string): Promise<void> {
  await measured.page.goto(`${base}/dashboard`, { waitUntil: "load" });
  await settle(measured, "dashboard prime", LOAD_WINDOW_MIN_MS);
}

const dmCold: Journey = {
  name: "dm-cold",
  // A fresh context holding only the stored session: no HTTP cache, no service
  // worker, no IndexedDB. The first load of a returning user whose caches are empty.
  async run(env) {
    const measured = await openMeasuredPage(env.browser, env.profile, { storageState: env.dm, throttled: true, content: CONTENT.dashboard });
    try {
      return [await loadAndMeasure(measured, `${env.base}/dashboard`, "dm-cold", false)];
    } finally {
      await measured.context.close();
    }
  },
};

const dmWarm: Journey = {
  name: "dm-warm",
  // Same context loads once (discarded) so the service worker is installed and
  // the persisted library cache is written, then reloads: a returning user's next visit.
  async run(env) {
    const measured = await openMeasuredPage(env.browser, env.profile, { storageState: env.dm, throttled: true, content: CONTENT.dashboard });
    try {
      await primeDashboard(measured, env.base);
      // Wait for the worker to be active and the query persister (throttled
      // writes) to have flushed; without this the "warm" reload races its own cache.
      await measured.page.evaluate("navigator.serviceWorker ? navigator.serviceWorker.ready.then(() => true) : false");
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return [await loadAndMeasure(measured, `${env.base}/dashboard`, "dm-warm", true)];
    } finally {
      await measured.context.close();
    }
  },
};

const NAV_TARGETS = ["/npcs", "/encounters", "/quests"] as const;

const dmNav: Journey = {
  name: "dm-nav",
  // Real sidebar clicks (vue-router client navigation), one window per click,
  // so a view's own fetches are not blamed on the previous one.
  async run(env) {
    const measured = await openMeasuredPage(env.browser, env.profile, { storageState: env.dm, throttled: true });
    try {
      await primeDashboard(measured, env.base);
      const steps: Step[] = [];
      for (const path of NAV_TARGETS) {
        measured.recorder.reset();
        await watchContent(measured.page, CONTENT[path]);
        await measured.page.locator(`a[href="${path}"]:visible`).first().click({ timeout: 15_000 });
        await measured.page.waitForURL((url) => url.pathname === path, { timeout: 15_000 });
        await settle(measured, `navigation to ${path}`);
        steps.push({ label: path, sample: await collectSample(measured, "navigation") });
      }
      return steps;
    } finally {
      await measured.context.close();
    }
  },
};

const playerCold: Journey = {
  name: "player-cold",
  async run(env) {
    if (env.player === null) throw new JourneySkipped("player fixture could not sign in");
    const measured = await openMeasuredPage(env.browser, env.profile, { storageState: env.player, throttled: true, content: CONTENT.hearth });
    try {
      const step = await loadAndMeasure(measured, `${env.base}/play`, "player-cold", false);
      // /play bounces a player with no campaign to /play/home; measuring that
      // would silently report a different page than the journey names.
      const landed = new URL(measured.page.url()).pathname;
      if (landed !== "/play") throw new JourneySkipped(`player fixture has no campaign (/play redirected to ${landed})`);
      return [step];
    } finally {
      await measured.context.close();
    }
  },
};

/** How long, in ms of app time, the tab is hidden: just past the app's 60 s wake threshold (App.vue `hiddenReconcileMs`). */
const HIDDEN_FOR_MS = 61_000;

const resume: Journey = {
  name: "resume",
  // The tab is hidden, the page's Date.now() is shifted 61 s forward, and the
  // tab becomes visible again (see INIT_SCRIPT in browser.ts). The app measures
  // its hidden window with Date.now(), so this triggers the same reconcile a
  // real minute away does, without the harness waiting a minute.
  async run(env) {
    const measured = await openMeasuredPage(env.browser, env.profile, { storageState: env.dm, throttled: true });
    try {
      await primeDashboard(measured, env.base);
      measured.recorder.reset();
      await measured.page.evaluate("window.__perfSetVisibility('hidden')");
      await new Promise((resolve) => setTimeout(resolve, 200));
      await measured.page.evaluate(`window.__perfAdvanceClock(${HIDDEN_FOR_MS})`);
      await measured.page.evaluate("window.__perfSetVisibility('visible')");
      // The reconcile is async (it asks for the session first), so give it room to start.
      await settle(measured, "resume", 2000);
      return [{ label: "resume", sample: await collectSample(measured, "resume") }];
    } finally {
      await measured.context.close();
    }
  },
};

export const JOURNEYS: readonly Journey[] = [dmCold, dmWarm, dmNav, playerCold, resume];
