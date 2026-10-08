import { readonly, ref } from "vue";
import type { Router } from "vue-router";

/**
 * How long a navigation may wait before the page shows a skeleton. vue-router
 * keeps the old page on screen until the destination's lazy chunk has
 * downloaded, so a cold route reads as a dead tap. A warm chunk resolves in a
 * few milliseconds and must never flash a skeleton, hence a delay rather than
 * showing it at once.
 */
export const NAVIGATION_PENDING_DELAY_MS = 100;

const pending = ref(false);

/** True while a navigation to a different page has waited past the delay. */
export const navigationPending = readonly(pending);

/**
 * Arms `navigationPending` for navigations that swap the top-level page.
 *
 * Not armed for: the first navigation (the boot splash owns that), a child
 * route or query-only change (the list stays mounted and the detail opens over
 * it, so `matched[0]` is unchanged), or a layout change (the outgoing layout
 * would be torn down under a skeleton drawn for the other one).
 *
 * Register LAST. In-component leave guards run before every global beforeEach,
 * and an earlier global guard can still redirect or cancel; arriving here means
 * the navigation is allowed to leave, so the skeleton never covers a page the
 * user is being kept on (an unsaved-changes prompt, a redirect to /login).
 *
 * Returns an uninstall function (used by tests).
 */
export function installNavigationPending(router: Router): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clear(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending.value = false;
  }

  const removeBefore = router.beforeEach((to, from) => {
    clear();
    const swapsPage =
      from.matched.length > 0 &&
      to.matched[0] !== from.matched[0] &&
      to.meta.layout === from.meta.layout;
    if (swapsPage) {
      timer = setTimeout(() => {
        timer = undefined;
        pending.value = true;
      }, NAVIGATION_PENDING_DELAY_MS);
    }
  });
  // afterEach also runs for aborted and cancelled navigations; onError covers a
  // guard that throws and a chunk that fails to import.
  const removeAfter = router.afterEach(clear);
  const removeError = router.onError(clear);

  return () => {
    removeBefore();
    removeAfter();
    removeError();
    clear();
  };
}
