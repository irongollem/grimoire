import { createApp, watch } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import App from "./App.vue";
import { vRollMode } from "./directives/vRollMode";
import { routes, setupRouterGuard } from "./router/index";
import { supabase, onSessionLost, consumeRefusedRead, getCurrentUser } from "./lib/supabase";
import { createIdentityChangeGate, resetForNewIdentity } from "./lib/authIdentityChange";
import { createSessionRecovery } from "./lib/sessionRecovery";
import { createQueryPersistence } from "./lib/queryPersistence/persistence";
import { isStaticContent, persistClass } from "./lib/queryPersistence/policy";
import { track } from "./lib/analytics";
import { getAiGeneratorRegistry } from "./ai/aiGeneratorRegistry";
import { useAuthStore } from "./stores/auth";
import { installStaleChunkRecovery, chunksArrived } from "./lib/staleChunkRecovery";
import { queryRetryDelay, shouldRetryQuery } from "./lib/queryRetry";
import { initErrorTracking, loadErrorTrackingAfterPaint, reportHandledError } from "./lib/observability/sentry";
import { installNavigationReload, installSwAutoUpdate } from "./lib/swAutoUpdate";
import { updateAvailable } from "./composables/useAppUpdate";
import { captureInstallPrompt } from "./composables/usePwaInstall";
import { pendingBundleFile } from "@/composables/campaign/usePendingBundle";
import { useSoundboardStore } from "./stores/soundboard";
import { useSpotifyStore } from "./stores/spotify";

import "./assets/fonts";
import "./assets/main.css";

// Shared library lists and live campaign data are answered from IndexedDB the
// first time a page session fetches them and written back after every fetch,
// one record per query and read only when that query is about to fetch. Library
// content is trusted for a day; campaign data is painted from disk and always
// revalidated at once. policy.ts has the classes and why (#999).
const persistence = createQueryPersistence({
  buildId: __BUILD_ID__,
  getUserId: () => getCurrentUser()?.id ?? null,
  shouldPersist: persistClass,
  onError: (error) => reportHandledError(error, "queryPersistence"),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      persister: persistence.persister,
      networkMode: "always",
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: shouldRetryQuery,
      retryDelay: queryRetryDelay,
    },
    mutations: { networkMode: "always" },
  },
});

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition ?? { top: 0 };
  },
});

// The "next navigation" half of the deferred deploy reload (see swAutoUpdate.ts):
// when a new build is waiting and nothing is busy, the navigation becomes a full
// page load onto it. The handle exists only in production, where the service
// worker is installed. In-component leave guards (`useUnsavedGuard`) run before
// global `beforeEach`, so an editor with unsaved work has already been asked.
// Registered before `setupRouterGuard` so a navigation that is about to become a
// full page load does not do the auth and lens work first.
let takeNavigationReload: () => Promise<boolean> = () => Promise.resolve(false);
const leavingForNewBuild = installNavigationReload(router, () => takeNavigationReload());

// The query client goes in because the guard's lens fence (#847) resolves the
// caller's role in the active campaign from `campaign_members`, sharing
// `useModeSwitch`'s cache entry so the check is a cache hit rather than a
// round trip on every navigation.
setupRouterGuard(router, queryClient);

// A deploy strands already-open pages: the fresh service worker deletes the
// old build's cache on activate, so the old page's next lazy route import
// 404s and the navigation dies. Recover with a one-shot hard reload onto the
// fresh build instead of showing a dead "failed to load" view.
installStaleChunkRecovery(router);

const app = createApp(App);

// Before any plugin, directive or store — this installs Vue's errorHandler and
// the global handlers, and anything thrown during the wiring below is exactly
// the kind of boot failure worth hearing about. They only buffer: the Sentry SDK
// itself is a separate chunk that loads after first paint (see below), or sooner
// if an error arrives first, and replays what was held. No-op without a DSN.
initErrorTracking(app, router);

const pinia = createPinia();
app.use(pinia);
app.use(VueQueryPlugin, { queryClient });
app.use(router);

// A backgrounded tab's timers freeze, so the access token can expire without
// auto-refresh ever firing; the requests sent on wake-up are then anonymous and
// RLS answers `200 []` rather than an error, leaving a fully rendered app with
// none of the user's data in it (#727). Wired here because recovery needs both
// the query client and the store — neither exists inside lib/supabase.ts.
onSessionLost(
  createSessionRecovery({
    hasUsableSession: async () => {
      // getSession(), never refreshSession() — see sessionRecovery.ts.
      const { data } = await supabase.auth.getSession();
      return !!data.session?.access_token;
    },
    // The empty results are cached as real answers; without this the app stays
    // blank even though the session is back.
    refetchAll: () => void queryClient.invalidateQueries(),
    signOutAndRedirect: () => {
      void useAuthStore()
        .signOut()
        .finally(() => {
          if (window.location.pathname !== "/login") window.location.href = "/login";
        });
    },
  }),
);

// The other half of the wake-up fix (#731). A refresh that fails while the radio
// is still coming up leaves auth-js holding a valid refresh token, a preserved
// session, and a 60s cooldown during which every read goes out as `anon` — and
// `authAwareFetch` now refuses those rather than letting RLS answer `200 []`, so
// the affected queries sit in an error state instead of a wrong one. auth-js
// keeps ticking while the tab is visible; when it finally succeeds this is the
// event that says so, and those queries need re-running.
//
// Deferred by a tick because auth-js awaits this callback before it settles the
// refresh in flight: a query sent from here that routes through a refresh waits
// on the very refresh that is waiting on it. Same hazard, and same remedy, as the
// note in `stores/auth.ts`.
supabase.auth.onAuthStateChange((event) => {
  if (event !== "TOKEN_REFRESHED") return;
  if (!consumeRefusedRead()) return;
  setTimeout(() => void queryClient.invalidateQueries(), 0);
});

// And the same remedy for the other way a query can hold an answer that was
// right when it arrived: cached while signed out, served once signed in. See
// `authIdentityChange.ts` for the production report and why nothing else
// catches it — `authAwareFetch` refuses an anon read only when the app already
// believes it is signed in, which is precisely not this case.
//
// Gated on the identity actually changing, because auth-js re-emits SIGNED_IN
// for a session it already had (tab focus, a restored session) and refetching
// the whole app on each of those would be a storm for nothing. Deferred by a
// tick for the same reason as the handler above: auth-js awaits this listener.
const identityChanged = createIdentityChangeGate();
// Pruning is not tied to the cache reset: the reset is skipped on a cold
// load's INITIAL_SESSION (see the gate), but another account's library copy
// and week-old records must still leave the device once per user seen.
let prunedFor: string | null = null;
supabase.auth.onAuthStateChange((event, session) => {
  const userId = session?.user?.id ?? null;
  // Before the gate, which answers false for a null user: signing out must empty
  // the disk copy so the next account on this device never sees it.
  if (userId === null) setTimeout(() => void persistence.clear(), 0);
  if (userId !== null && userId !== prunedFor) {
    prunedFor = userId;
    setTimeout(() => void persistence.prune(userId), 0);
  }
  if (!identityChanged(userId, event) || userId === null) return;
  // Reset rather than invalidate, so another account's rows leave the screen
  // before the refetch lands, not after it (#981).
  setTimeout(() => void resetForNewIdentity(queryClient, isStaticContent), 0);
});

// Every AI generator registers itself so the badge can discover it without
// being updated (see ai/aiGenerationState.ts), which makes the registry the one
// place that sees every generation begin. Counting them here rather than in each
// of the ~14 useXxxGeneration composables means no scattered call sites and no
// step 6 to forget: a new generator is counted the moment it registers.
//
// The label is the registry's own short literal ("NPC", "Monster") — never the
// user's concept text, which is exactly what lib/analytics.ts refuses to send.
watch(
  () => getAiGeneratorRegistry().map((g) => [g.label, g.isGenerating.value] as const),
  (now, before) => {
    for (const [label, generating] of now) {
      const wasGenerating = before?.find(([seen]) => seen === label)?.[1] ?? false;
      if (generating && !wasGenerating) track({ name: "generator_used", kind: label });
    }
  },
);

// Registered synchronously (not in the async block below) so roll triggers that
// mount early can always resolve `v-roll-mode` (#501).
app.directive("roll-mode", vRollMode);

// Browser-only setup — directives, PWA install prompt, service worker, and a
// couple of platform quirks. Loaded after the app is wired up.
Promise.all([
  import("@/composables/play/useWakeLock"),
  import("./lib/tooltip"),
  import("./directives/tooltip"),
  import("./directives/noPwm"),
])
  .then((modules) => {
    // A stale chunk arrives here as `undefined`, not as a rejection — see
    // `chunksArrived`'s docstring in staleChunkRecovery.ts for why
    // (DUNGEON-GRIMOIRE-8). Bail quietly: a reload is already in flight.
    if (!chunksArrived(modules)) return;
    const [wakeLock, tooltipEngine, tooltipDirective, noPwmDirective] = modules;

    app.directive("tooltip", tooltipDirective.tooltip);
    app.directive("no-pwm", noPwmDirective.noPwm);
    tooltipEngine.installTooltipEngine();

    window.addEventListener("beforeinstallprompt", captureInstallPrompt, { once: true });
    document.addEventListener("visibilitychange", wakeLock.onWakeLockVisibilityChange);
  })
  .catch((error: unknown) => {
    // A genuine rejection — an import that failed for a reason `preloadError`
    // did not cover, e.g. an offline first load. Reported rather than left to
    // become a second unhandled rejection; `beforeSend` still drops it if it
    // turns out to be a stale chunk after all.
    reportHandledError(error, "main:browser-only-setup");
  });

// File Handling API — handle .grimoire files opened from the OS (Chrome/Edge PWA only)
const lq = (window as Window & {
  launchQueue?: { setConsumer: (fn: (p: { files: FileSystemFileHandle[] }) => void) => void };
}).launchQueue;
if (lq) {
  lq.setConsumer(async ({ files }) => {
    const [handle] = files;
    if (!handle) return;
    const file = await handle.getFile();
    if (!file.name.endsWith(".grimoire")) return;
    pendingBundleFile.value = file;
  });
}

// Service worker — register, poll for new deploys, and reload onto them.
// The table patches mid-session because a feature is wanted at the table NOW,
// so a deploy is not parked behind the "Reload to update" menu action alone. A
// page is never reloaded under the user, and never while backgrounded, where
// iOS freezes the boot mid-refresh (see swAutoUpdate.ts): it adopts the build
// on its next navigation (the beforeEach guard above) or through the menu
// action (updateAvailable). A mutation in flight or live soundboard/Spotify
// audio defers the navigation reload to a later navigation.
if (import.meta.env.PROD) {
  ({ takeNavigationReload } = installSwAutoUpdate({
    // Both audio stores are imported statically, and must stay that way (#593).
    // This used to `import()` them, on the theory that it kept the audio stack
    // out of the entry chunk for a check that only runs on deploys. It did not:
    // the app shell already reaches both eagerly and unconditionally, via the
    // top bar's playing-count badge (SoundboardWidgetToggle), the always-mounted
    // SoundboardWidget and trigger bus in DefaultLayout, and useMediaSession in
    // App.vue. So the dynamic import moved nothing and only earned an
    // INEFFECTIVE_DYNAMIC_IMPORT warning. Removing all four of those consumers
    // outright takes a measured 11 kB gzip off the entry — which does not pay
    // for async-ifying the CarPlay media-session or audio-trigger paths.
    isBusy: () =>
      queryClient.isMutating() > 0 ||
      useSoundboardStore(pinia).hasActiveAudio ||
      useSpotifyStore(pinia).isPlaying,
    onDeferred: () => {
      updateAvailable.value = true;
    },
  }));
}

// iOS Safari keyboard scroll fix
if (window.visualViewport) {
  let lastVpHeight = window.visualViewport.height;
  window.visualViewport.addEventListener("resize", () => {
    const currentHeight = window.visualViewport!.height;
    const delta = lastVpHeight - currentHeight;
    lastVpHeight = currentHeight;
    if (delta < 150) return;
    const el = document.activeElement as HTMLElement | null;
    if (!el || !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;

    setTimeout(() => {
      let container: HTMLElement | null = el.parentElement;
      while (container && container !== document.body) {
        const { overflowY } = getComputedStyle(container);
        if (overflowY === "auto" || overflowY === "scroll") break;
        container = container.parentElement;
      }
      if (!container || container === document.body) return;

      const vpHeight = window.visualViewport!.height;
      const elRect = el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const target =
        container.scrollTop + (elRect.top - cRect.top) - vpHeight / 2 + elRect.height / 2;
      container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    }, 60);
  });
}

// Mount after the router's first navigation (and its async auth guard) resolves,
// so the correct view renders immediately — no logged-out/guest flash on a cold
// load of an authed route.
//
// isReady() rejects when the first navigation is aborted, and the deploy reload
// above is the one guard that aborts: it has already sent the browser to the
// destination on the new build, so there is nothing to mount and nothing to
// report (see installNavigationReload). Any other rejection is a boot failure
// and is rethrown, so it still reaches Sentry as an unhandled rejection.
router.isReady().then(
  () => {
    app.mount("#app");
    // The SDK stays off the critical path: it loads once the page has painted.
    loadErrorTrackingAfterPaint();
  },
  (failure: unknown) => {
    if (leavingForNewBuild()) return;
    throw failure;
  },
);
