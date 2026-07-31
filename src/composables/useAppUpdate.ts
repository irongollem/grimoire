import { ref } from "vue";

/**
 * Signals that a new build has taken control but the automatic reload onto
 * it was deferred (active text entry, an in-flight save, or live audio —
 * see swAutoUpdate). Consumed by the "More" menus (PlayerNavGrid /
 * DmNavMoreSheet) to surface a "Reload to update" action so the user can
 * adopt the update at their own moment instead of waiting for the
 * coordinator's next retry.
 */
export const updateAvailable = ref(false);

export function reloadApp() {
  window.location.reload();
}
