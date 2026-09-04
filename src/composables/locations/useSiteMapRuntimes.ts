import { ref, watch, type Ref } from "vue";
import { loadPack, type TilePackRuntime } from "@/cartographer/packLoader";
import { useTilePacks, loadUserPack } from "@/composables/cartographer/useTilePacks";
import { collectUsedPackRefs } from "@/lib/locations/siteMap";
import type { DungeonMap } from "@/types/dungeonMap.types";

/**
 * Bundled starter packs are served straight from `public/cartographer/` at a
 * URL derived from `(pack_id, pack_version)` alone — see "Naming & layout" in
 * context/features/cartographer.md. There is no shared constant for the
 * enumerated bundled-pack list outside `CartographerEditorView.vue` (its
 * `BUNDLED_PACKS` array is local to that view, which this feature must not
 * import from), so this derives the URL from the naming convention instead of
 * duplicating that list. A pack that doesn't exist at the derived URL simply
 * fails to load and the cell renders its placeholder tile — the same
 * graceful-degradation behaviour `packLoader.ts` already gives a stale or
 * missing pack in the editor.
 */
function bundledManifestUrl(packId: string, packVersion: number): string {
  return `/cartographer/${packId}/v${packVersion}/manifest.json`;
}

/** Custom user/campaign packs are namespaced `custom-<slug>-<owner-prefix>`
 *  (see `namespacedPackId` in useTilePacks.ts) — never a bundled pack id. */
function isCustomPackId(packId: string): boolean {
  return packId.startsWith("custom-");
}

/**
 * Loads exactly the tile-pack runtimes a given map's cells reference,
 * read-only — mirrors how `CartographerEditorView` obtains a
 * `TilePackRuntime` via `loadPack`/`loadUserPack`, but scoped to the packs
 * this map actually uses instead of eagerly loading every bundled pack (the
 * editor does that because it must be ready to paint with any of them; a
 * viewer only ever needs to render what is already on the map).
 *
 * A single missing or broken pack does not fail the whole map: `renderMap`
 * already falls back to a placeholder tile per-cell when a pack id isn't in
 * the `runtimes` map, so a failed load for one pack is simply left out.
 */
export function useSiteMapRuntimes(map: Ref<DungeonMap | null | undefined>) {
  const { packs: userPacks } = useTilePacks(undefined, false);
  const runtimes = ref(new Map<string, TilePackRuntime>());
  const loading = ref(false);

  watch(
    map,
    async (current) => {
      if (!current) {
        runtimes.value = new Map();
        return;
      }
      loading.value = true;
      const refs = collectUsedPackRefs(current.layers);
      const next = new Map<string, TilePackRuntime>();
      await Promise.all(
        refs.map(async (packRef) => {
          try {
            if (isCustomPackId(packRef.pack_id)) {
              const userPack = (userPacks.data.value ?? []).find(
                (p) => p.pack_id === packRef.pack_id && p.pack_version === packRef.pack_version,
              );
              if (!userPack) return;
              next.set(packRef.pack_id, await loadUserPack(userPack));
            } else {
              next.set(packRef.pack_id, await loadPack(bundledManifestUrl(packRef.pack_id, packRef.pack_version)));
            }
          } catch {
            // Left out of `runtimes` — the affected cells render their
            // placeholder tile rather than losing the whole map.
          }
        }),
      );
      runtimes.value = next;
      loading.value = false;
    },
    { immediate: true },
  );

  return { runtimes, loading };
}
