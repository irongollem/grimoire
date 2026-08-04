import { ref } from "vue";

/**
 * Whether the once-per-account AI-use notice (see `AiUseNoticeGate.vue`) has
 * been dismissed *without* being acknowledged during this browser session.
 *
 * Module-scoped ref, not `useUiStore` and not `localStorage` — same pattern as
 * `useCast.ts`'s device-singleton state. `useUiStore` is for list-filter/UI
 * state that survives navigation (Filter State Pattern); this is a one-shot
 * "don't nag again this load" flag, and it must NOT survive a reload/new tab —
 * an unacknowledged campaign has to keep prompting until the user actually
 * confirms. A plain module-level ref gives exactly that lifetime: shared by
 * every mount of `AiUseNoticeGate` (the DM shell and the player shell can both
 * mount it across a session) and reset only when the module is re-evaluated,
 * i.e. on a full page reload.
 */
const dismissed = ref(false);

export function useAiUseNoticeDismissal() {
  function dismissForSession() {
    dismissed.value = true;
  }

  return { dismissed, dismissForSession };
}
