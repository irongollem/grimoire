import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { createPinia } from "pinia";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import App from "./App.vue";
import { vRollMode } from "./directives/vRollMode";
import { routes, setupRouterGuard } from "./router/index";
import { installStaleChunkRecovery } from "./lib/staleChunkRecovery";
import { installSwAutoUpdate } from "./lib/swAutoUpdate";
import { updateAvailable } from "./composables/useAppUpdate";
import { captureInstallPrompt } from "./composables/usePwaInstall";
import { pendingBundleFile } from "./composables/usePendingBundle";

import "./assets/main.css";

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      retry: (failureCount, error) => {
        if (isAbortError(error)) return failureCount < 2;
        return failureCount < 3;
      },
      retryDelay: (attemptIndex, error) => {
        if (isAbortError(error)) return 600 * (attemptIndex + 1);
        return Math.min(1000 * 2 ** attemptIndex, 30_000);
      },
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
const pinia = createPinia();
app.use(pinia);
app.use(VueQueryPlugin, { queryClient });
app.use(router);

// Registered synchronously (not in the async block below) so roll triggers that
// mount early can always resolve `v-roll-mode` (#501).
app.directive("roll-mode", vRollMode);

// Browser-only setup — directives, PWA install prompt, service worker, and a
// couple of platform quirks. Loaded after the app is wired up.
Promise.all([
  import("./composables/useWakeLock"),
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
    isBusy: async () => {
      if (queryClient.isMutating() > 0) return true;
      // Lazy: the soundboard store pulls the whole audio stack, which must
      // not ride into the entry chunk for a check that runs on deploys only.
      const [{ useSoundboardStore }, { useSpotifyStore }] = await Promise.all([
        import("./stores/soundboard"),
        import("./stores/spotify"),
      ]);
      return useSoundboardStore(pinia).hasActiveAudio || useSpotifyStore(pinia).isPlaying;
    },
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
