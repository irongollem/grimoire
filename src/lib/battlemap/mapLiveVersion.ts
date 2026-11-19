// The version gate for a published live snapshot. Pure and edge-importable (no Vue), so the server reads the same
// snapshots the browser does. `liveLayer.ts` wraps it with Vue's `toRaw` for the browser.

import { MAP_LIVE_VERSION, type MapLive } from "../../types/mapLive.types.ts";

/**
 * The snapshot a reader may use: only the current version. A version-1 snapshot's standing bakes hold every door leaf,
 * which the live layer would draw a second time, so a site published before the doors went live reads as a plain
 * picture until it is published again (#1073). The DB may still hold 1, hence the comparison through `number`.
 */
export function currentVersionOf(snapshot: MapLive | null): MapLive | null {
  if (snapshot === null) return null;
  const version: number = snapshot.version;
  return version === MAP_LIVE_VERSION ? snapshot : null;
}
