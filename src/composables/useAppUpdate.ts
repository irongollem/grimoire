import { ref } from "vue";
import { untilNewestWorkerControls } from "@/lib/swAutoUpdate";

/**
 * Signals that a new build has taken control while the page is still visible,
 * so it has not been reloaded onto it (see swAutoUpdate). A visible page is
 * never reloaded by a timer or by the worker taking control, because
 * reloading a page the user has just returned to is what people experience as
 * the app being slow. It adopts the build when it is backgrounded, at the
 * user's next route navigation (a full page load of the destination, which
 * also avoids the stale-chunk window staleChunkRecovery has to repair), or
 * when the user picks "Reload to update" in the "More" menus (PlayerNavGrid /
 * DmNavMoreSheet), which this flag surfaces.
 */
export const updateAvailable = ref(false);

/** Waits out a worker install in progress so the reload lands on the newest build. */
export async function reloadApp() {
  await untilNewestWorkerControls();
  window.location.reload();
}
