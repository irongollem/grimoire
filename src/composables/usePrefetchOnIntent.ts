import type { ObjectDirective } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { prefetchRouteComponents } from "@/router/routeChunks";

interface IntentState {
  to: string | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
  detach: () => void;
}

/**
 * A `v-prefetch="path"` directive: when the pointer rests on a link, it takes
 * keyboard focus or a finger lands on it, start that destination's route chunk
 * and its first data read, so the click finds both warm (#999).
 *
 * Declare it in a component's `<script setup>` as
 * `const vPrefetch = usePrefetchOnIntent()`. It is built from the setup's own
 * router and query client, because a directive has no injection context of its
 * own, and it lives on the element rather than on a wrapper so it works on a
 * `RouterLink`, an `AppButton` or a plain `<button>` alike.
 *
 * Pointer hover waits `delayMs` so sweeping the mouse across a sidebar does not
 * fire a request per row; focus and touch have already shown intent and start at
 * once. The data half lives in a module loaded on first intent, because it pulls
 * in every list composable and the entry has no room for them.
 */
export function usePrefetchOnIntent(delayMs = 80): ObjectDirective<HTMLElement, string | undefined> {
  const router = useRouter();
  const queryClient = useQueryClient();
  const states = new WeakMap<HTMLElement, IntentState>();

  function start(to: string | undefined) {
    if (!to) return;
    prefetchRouteComponents(router, to);
    void import("@/router/routeDataPrefetch")
      .then((module) => module.prefetchRouteData(queryClient, to))
      .catch(() => undefined);
  }

  return {
    mounted(el, binding) {
      const state: IntentState = { to: binding.value, timer: undefined, detach: () => undefined };
      const cancel = () => {
        clearTimeout(state.timer);
        state.timer = undefined;
      };
      const onEnter = () => {
        cancel();
        state.timer = setTimeout(() => start(state.to), delayMs);
      };
      const onNow = () => {
        cancel();
        start(state.to);
      };
      el.addEventListener("pointerenter", onEnter);
      el.addEventListener("pointerleave", cancel);
      el.addEventListener("focus", onNow);
      el.addEventListener("touchstart", onNow, { passive: true });
      state.detach = () => {
        cancel();
        el.removeEventListener("pointerenter", onEnter);
        el.removeEventListener("pointerleave", cancel);
        el.removeEventListener("focus", onNow);
        el.removeEventListener("touchstart", onNow);
      };
      states.set(el, state);
    },
    updated(el, binding) {
      const state = states.get(el);
      if (state) state.to = binding.value;
    },
    unmounted(el) {
      states.get(el)?.detach();
      states.delete(el);
    },
  };
}
