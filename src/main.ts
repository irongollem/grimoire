import { ViteSSG } from "vite-ssg";
import { createPinia } from "pinia";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import App from "./App.vue";
import { routes, setupRouterGuard } from "./router/index";
import { updateAvailable } from "./composables/useAppUpdate";
// Static imports for modules also statically imported by browser-only components —
// dynamic-importing them here produced INEFFECTIVE_DYNAMIC_IMPORT warnings without
// actually splitting any chunk. Both modules are SSR-safe (no top-level window access).
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

export const createApp = ViteSSG(
  App,
  { routes },
  ({ app, router }) => {
    app.use(createPinia());
    app.use(VueQueryPlugin, { queryClient });

    setupRouterGuard(router);

    if (!import.meta.env.SSR) {
      // Browser-only imports and setup.
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

      // Service worker
      if ("serviceWorker" in navigator && import.meta.env.PROD) {
        window.addEventListener("load", () => {
          navigator.serviceWorker.register("/sw.js").catch(() => {});
        });
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          const p = window.location.pathname;
          // Auth pages reload immediately — the user isn't mid-task and the
          // fresh SW is needed to serve up-to-date login/signup assets.
          if (p === "/login" || p === "/signup" || p.startsWith("/join/")) {
            window.location.reload();
            return;
          }
          // For all other pages, surface a banner instead of force-reloading.
          // The new service worker is already active and will serve fresh assets
          // for any subsequent fetches; the user can reload at a convenient moment.
          updateAvailable.value = true;
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
    }
  },
);
