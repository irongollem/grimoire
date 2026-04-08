import { createApp } from "vue";
import { createPinia } from "pinia";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";
import router from "./router";
import App from "./App.vue";

import "./assets/main.css";

// networkMode: 'always' prevents TanStack Query from pausing mutations/queries
// when the browser briefly reports "offline" on tab focus after sleep/switch.
//
// AbortError handling: Supabase uses navigator.locks for auth token management.
// When two tabs are open, one tab can steal the lock, which throws an AbortError
// on any in-flight DB request in the other tab. Supabase auto-recovers in ~500ms.
// TanStack Query does NOT retry AbortErrors by default (it treats them as cancelled).
// We override that here so AbortErrors are retried with a delay, giving the auth
// lock time to recover before we try again. This fixes infinite spinners on every
// page that uses TanStack Query for data fetching.
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      // Disable TQ's built-in focus refetch — we handle this manually in App.vue
      // after confirming the session is warm (prevents queries queuing behind the
      // navigator.locks auth refresh and spinning forever with no network activity).
      refetchOnWindowFocus: false,
      // 60s global stale time: cached data is shown instantly on re-mount and a
      // background refetch only fires if the data is older than 60 seconds.
      // Individual queries can override this (e.g. staleTime: Infinity for SRD
      // reference data, or staleTime: 0 for anything that must always be live).
      staleTime: 60_000,
      retry: (failureCount, error) => {
        if (isAbortError(error)) return failureCount < 2; // 2 retries for lock recovery
        return failureCount < 3;
      },
      retryDelay: (attemptIndex, error) => {
        if (isAbortError(error)) return 600 * (attemptIndex + 1); // 600ms, 1200ms
        return Math.min(1000 * 2 ** attemptIndex, 30_000);
      },
    },
    mutations: { networkMode: "always" },
  },
});


const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);

app.mount("#app");

// iOS Safari: when the virtual keyboard appears the visual viewport shrinks
// without reflowing the layout. Scroll the focused input to the centre of the
// visible area so that absolute-positioned dropdowns (top-full / bottom-full)
// are not hidden behind the keyboard.
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
    }
  });
}
