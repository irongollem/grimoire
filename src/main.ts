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

// Log all query/mutation errors to the console so failures are never silent.
// AbortErrors from auth lock recovery are excluded (expected, handled via retry).
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action.type === "error") {
    const err = event.action.error;
    if (!isAbortError(err)) {
      console.error(`[query] ${String(event.query.queryKey)} failed:`, err);
    }
  }
});
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.mutation?.state.status === "error") {
    const err = event.mutation.state.error;
    if (err && !isAbortError(err)) {
      console.error("[mutation] failed:", err);
    }
  }
});

const app = createApp(App);

app.use(createPinia());
app.use(VueQueryPlugin, { queryClient });
app.use(router);

app.mount("#app");
