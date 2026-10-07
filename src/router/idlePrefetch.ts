import { watch } from "vue";
import type { Router } from "vue-router";
import { NAV_ITEMS } from "@/lib/nav";
import { ALL_PLAYER_NAV } from "@/lib/playerNav";
import { afterFirstPaint } from "@/lib/afterFirstPaint";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { prefetchRouteChunks } from "./prefetchInitial";

interface NetworkInformationLike {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Whether spending idle bandwidth on pages nobody asked for is welcome. Not on
 * a data-saver setting or a connection slow enough that the prefetch would
 * compete with what the user is actually waiting for.
 */
export function idlePrefetchAllowed(
  connection: NetworkInformationLike | undefined = (navigator as Navigator & { connection?: NetworkInformationLike }).connection,
): boolean {
  if (!connection) return true;
  if (connection.saveData === true) return false;
  return connection.effectiveType !== "2g" && connection.effectiveType !== "slow-2g";
}

/** Downloads the chunks one at a time, each in its own idle slot. */
export function prefetchChunksWhenIdle(router: Router, paths: readonly string[]): void {
  const queue = [...paths];
  const next = () => {
    const path = queue.shift();
    if (path === undefined) return;
    prefetchRouteChunks(router, path);
    afterFirstPaint(next);
  };
  afterFirstPaint(next);
}

/**
 * Once the first page has painted, fetch the route chunks of the main
 * navigation destinations so a click is not also a download (#999).
 *
 * Waits for the viewer's role, since a DM and a player navigate to different
 * places, and runs once. The service worker precaches only the boot shell, so
 * on a first session (before it controls the page) these requests are the only
 * thing between a click and a chunk download; from the second visit the runtime
 * cache answers them.
 *
 * Tools that exist for A4 output (`desktopOnly`) are left to prefetch on
 * intent: they are the heaviest chunks and the least visited.
 */
export function startIdleChunkPrefetch(router: Router): void {
  if (!idlePrefetchAllowed()) return;
  const auth = useAuthStore();
  const stop = watch(
    () => auth.currentRole,
    (role) => {
      if (role === null) return;
      // `stop` is not assigned yet when the watcher fires immediately.
      queueMicrotask(() => stop());
      if (role === "dm") {
        const hasCampaign = useCampaignStore().activeCampaignId !== null;
        prefetchChunksWhenIdle(
          router,
          NAV_ITEMS.filter((item) => !item.desktopOnly && (hasCampaign || !item.requiresCampaign)).map(
            (item) => item.to,
          ),
        );
      } else {
        prefetchChunksWhenIdle(router, ALL_PLAYER_NAV.map((item) => item.to));
      }
    },
    { immediate: true },
  );
}
