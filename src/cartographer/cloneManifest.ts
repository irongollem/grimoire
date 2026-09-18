import type { TilePackManifest } from "./packSchema";

/**
 * Deep-copy a manifest that came out of a query cache, before rewriting its
 * slot URLs for loading.
 *
 * `structuredClone` is the obvious tool and the wrong one here: a manifest read
 * through TanStack Query arrives wrapped in Vue's deep reactive proxy, and
 * `structuredClone` refuses a Proxy outright — "Failed to execute
 * 'structuredClone' on 'Window': #<Object> could not be cloned". That throw
 * happened on every pack load, so the Cartographer showed its picker fully
 * populated and then failed to draw a single tile, with the reason tucked into
 * the status bar. Caught by opening the app, not by any gate.
 *
 * A manifest is by definition JSON — it is stored in a `jsonb` column and
 * shipped as JSON — so a JSON round-trip is not a lossy shortcut here, it is
 * the exact right shape, and it strips every proxy layer on the way through.
 */
export function cloneManifest(manifest: TilePackManifest): TilePackManifest {
  return JSON.parse(JSON.stringify(manifest)) as TilePackManifest;
}
