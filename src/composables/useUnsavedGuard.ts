import { ref } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, type RouteLocationNormalized } from "vue-router";

/**
 * Guards navigating away from an editor that holds unsaved work, asking the
 * user to confirm before the router lets the navigation discard it.
 *
 * Registered on `onBeforeRouteLeave` *and* `onBeforeRouteUpdate` — deliberately
 * both, not one for safety margin. `onBeforeRouteLeave` fires only when the
 * matched route *record* changes. A query-only change on the same record —
 * the browser's Back button unwinding a `?edit=true` this editor opened is the
 * recurring case — is an *update*, not a leave, so that hook alone never sees
 * it. The component can still be unmounted a moment later by a parent's
 * `v-if`/`v-else` switching on that same query, which is exactly the silent
 * data-loss path this composable exists to close (it was the original bug in
 * NoteEditor.vue, which is where this pattern was lifted from).
 *
 * Guards return a boolean (optionally via a Promise) rather than calling the
 * legacy `next()` callback: `next()` is deprecated in this Vue Router version
 * and logs `VUE_ROUTER_R0025` at runtime. Returning lets `ask()` be async —
 * the router simply awaits it — with no callback plumbing on either side.
 *
 * Lives at the composables root rather than under a feature folder: this is a
 * platform primitive over vue-router with no domain of its own, the same
 * relationship `useConfirm` has to its confirmation dialog.
 */
export interface UseUnsavedGuardOptions {
  /**
   * True when there is work worth protecting. Called fresh on every
   * navigation attempt, so pass a closure over reactive state (e.g.
   * `() => dirty.value`) rather than a snapshot taken at setup time.
   */
  isDirty: () => boolean;
  /**
   * True when navigating to `to` leaves this component mounted — a same-route
   * query toggle the parent renders as the same editor is the usual case.
   * Nothing is actually discarded, so the guard stays quiet without asking.
   * Omit when every navigation away unmounts the editor.
   */
  survives?: (to: RouteLocationNormalized) => boolean;
  /** Ask the user whether to discard. Resolving/returning `true` discards and lets the navigation through; `false` cancels it. */
  ask: () => Promise<boolean> | boolean;
}

export interface UseUnsavedGuardHandle {
  /**
   * Marks the component's own upcoming navigation as intended, so the guard
   * waves it through unasked. Set-and-forget rather than one-shot: call it
   * right before the `router.push`/`replace` on a save or delete path and
   * never clear it — the component is on its way out and about to unmount,
   * so there is nothing left to protect afterwards.
   */
  allowLeave(): void;
}

export function useUnsavedGuard(options: UseUnsavedGuardOptions): UseUnsavedGuardHandle {
  const { isDirty, survives, ask } = options;
  const leavingDeliberately = ref(false);

  async function guard(to: RouteLocationNormalized): Promise<boolean> {
    if (leavingDeliberately.value || (survives?.(to) ?? false) || !isDirty()) return true;
    return await ask();
  }

  onBeforeRouteLeave(guard);
  onBeforeRouteUpdate(guard);

  function allowLeave(): void {
    leavingDeliberately.value = true;
  }

  return { allowLeave };
}
