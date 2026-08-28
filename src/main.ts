import { createApp, watch } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import App from "./App.vue";
import { vRollMode } from "./directives/vRollMode";
import { routes, setupRouterGuard } from "./router/index";
import { supabase, onSessionLost, consumeRefusedRead } from "./lib/supabase";
import { createSessionRecovery } from "./lib/sessionRecovery";
import { track } from "./lib/analytics";
import { getAiGeneratorRegistry } from "./ai/aiGeneratorRegistry";
import { useAuthStore } from "./stores/auth";
import { installStaleChunkRecovery } from "./lib/staleChunkRecovery";
import { queryRetryDelay, shouldRetryQuery } from "./lib/queryRetry";
import { initErrorTracking } from "./lib/observability/sentry";
import { installSwAutoUpdate } from "./lib/swAutoUpdate";
import { updateAvailable } from "./composables/useAppUpdate";
import { captureInstallPrompt } from "./composables/usePwaInstall";
import { pendingBundleFile } from "@/composables/campaign/usePendingBundle";
import { useSoundboardStore } from "./stores/soundboard";
import { useSpotifyStore } from "./stores/spotify";

import "./assets/main.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
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

setupRouterGuard(router);

// A deploy strands already-open pages: the fresh service worker deletes the
// old build's cache on activate, so the old page's next lazy route import
// 404s and the navigation dies. Recover with a one-shot hard reload onto the
// fresh build instead of showing a dead "failed to load" view.
installStaleChunkRecovery(router);

const app = createApp(App);

// Before any plugin, directive or store — this installs Vue's errorHandler and
// the global handlers, and anything thrown during the wiring below is exactly
// the kind of boot failure worth hearing about. No-op without a DSN.
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
// Deferred by a tick because this callback is invoked *inside* the exclusive auth
// lock — refetching from here would re-enter it and deadlock every query in the
// app. Same hazard, and same remedy, as the note in `stores/auth.ts`.
supabase.auth.onAuthStateChange((event) => {
  if (event !== "TOKEN_REFRESHED") return;
  if (!consumeRefusedRead()) return;
  setTimeout(() => void queryClient.invalidateQueries(), 0);
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
]).then(([{ onWakeLockVisibilityChange }, { installTooltipEngine }, { tooltip: vTooltip }, { noPwm: vNoPwm }]) => {
  app.directive("tooltip", vTooltip);
  app.directive("no-pwm", vNoPwm);
  installTooltipEngine();

  window.addEventListener("beforeinstallprompt", captureInstallPrompt, { once: true });
  document.addEventListener("visibilitychange", onWakeLockVisibilityChange);
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
// so open PWAs adopt a deploy immediately rather than parking it behind the
// "Reload to update" menu action. The reload is deferred only while it would
// visibly interrupt — active text entry, an in-flight save, or live
// soundboard/Spotify audio — and catches up on backgrounding, once a minute,
// or via the menu action (updateAvailable), whichever comes first.
if (import.meta.env.PROD) {
  installSwAutoUpdate({
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
  });
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
router.isReady().then(() => app.mount("#app"));
