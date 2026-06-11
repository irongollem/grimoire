import { ref } from "vue";

/**
 * Signals that a new service-worker version has taken control.
 * Set to true in main.ts on the "controllerchange" event; consumed by
 * the "More" menus (PlayerNavGrid / DmNavMoreSheet) to surface a
 * non-intrusive "Reload to update" action instead of forcing an
 * immediate window.location.reload().
 */
export const updateAvailable = ref(false);

export function reloadApp() {
  window.location.reload();
}
