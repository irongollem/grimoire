// The tile packs the workbench paints with: the published library packs plus the campaign's own ready ones,
// the pack the map is on, and loading every runtime. Split out of MapWorkbench.vue (#1135).

import { computed, onMounted, ref, watch } from "vue";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { loadUserPack, useTilePacks } from "@/composables/cartographer/useTilePacks";
import { loadLibraryPack, useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { useCampaignStore } from "@/stores/campaign";

export function useWorkbenchPacks() {
  // Shared, admin-authored tile packs (#889) — replaces the old hardcoded
  // BUNDLED_PACKS array entirely. `publishedPacks` is already `sort_order`-
  // then-`name` ordered (see useLibraryTilePacks.ts), which is also the
  // ordering an admin controls for the picker AND the source of the default.
  const { packs: libraryPacksQuery, publishedPacks } = useLibraryTilePacks();
  const mapStyleCampaign = useCampaignStore();
  const activeCampaignId = computed(() => mapStyleCampaign.activeCampaignId);
  const { campaignPacks } = useTilePacks(activeCampaignId, false);
  const selectablePacks = computed(() => [
    ...publishedPacks.value.map((pack) => ({
      pack_id: pack.pack_id,
      pack_version: pack.pack_version,
      name: pack.name,
    })),
    ...campaignPacks.value.filter((pack) => pack.status === "ready").map((pack) => ({
      pack_id: pack.pack_id,
      pack_version: pack.pack_version,
      name: pack.name,
    })),
  ]);

  // `useMapCanvasEditor` and the bar both type this as a plain
  // Empty until the library query answers. That emptiness is internal
  // bookkeeping only — "has a pack been chosen yet" — and nothing downstream
  // reads it as a pack id: `packRuntime` misses the map, and every branch that
  // means "there is no pack" asks `hasPublishedPacks` or the query below rather
  // than comparing this to "". Kept a plain `Ref<string>` because that is what
  // `useMapCanvasEditor` takes and what its consumers (`renderMap`,
  // `paintOps`) require — and they only ever run once a pack exists, since the
  // canvas is replaced by the empty state otherwise.
  const currentPackId = ref("");
  /** The picker's default: the first published pack, or null when the library
   *  has none. Null rather than "" — absence here is a real answer, and the
   *  one place that turns it into a chosen id does so explicitly. */
  const firstPublishedPackId = computed<string | null>(() => publishedPacks.value[0]?.pack_id ?? null);
  const hasPublishedPacks = computed(() => publishedPacks.value.length > 0);
  // Resolves `currentPackId` once the library query answers, but only while
  // nothing else has claimed it yet (a stored `map.default_pack_id` applied by
  // `applyMapToState`, or the DM's own pick in the bar) — so a later
  // query refetch (e.g. an admin republishing) never clobbers a live choice.
  watch(firstPublishedPackId, (id) => {
    if (!currentPackId.value && id) currentPackId.value = id;
  }, { immediate: true });
  const packLoadError = ref<string | null>(null);
  const loadedRuntimes = ref(new Map<string, TilePackRuntime>());
  const packRuntime = computed(() => loadedRuntimes.value.get(currentPackId.value) ?? null);
  // True while the canvas has nothing to paint with yet: either the library
  // query is still in flight, or a pack id is known but its runtime hasn't
  // loaded. Once the query has answered and there simply is no pack (the
  // genuinely-empty library case), this settles to false so the overlay below
  // can show a real empty state instead of spinning forever.
  const awaitingDefaultPack = computed(() => {
    if (libraryPacksQuery.isLoading.value) return true;
    if (!hasPublishedPacks.value) return false;
    return !loadedRuntimes.value.has(currentPackId.value);
  });

  /** What the status bar calls the active pack. Never the raw `currentPackId`
   *  while it is still unresolved — that would surface the empty string as if
   *  it were a pack's name. */
  const packLabel = computed(() => {
    if (packRuntime.value) return packRuntime.value.manifest.name;
    if (libraryPacksQuery.isLoading.value) return "Loading packs…";
    if (!hasPublishedPacks.value) return "No packs published";
    return currentPackId.value;
  });

  // ── Pack load ───────────────────────────────────────────────────────────────

  async function ensurePackLoaded(): Promise<void> {
    // Every published library pack is eagerly preloaded, same as the old
    // BUNDLED_PACKS behaviour — a per-pack try/catch so one pack's missing
    // manifest or dead CDN object can't take the whole picker down. A pack
    // whose art hasn't been generated yet (or 404s) still resolves: `loadPack`
    // only rejects on a bad manifest fetch, never on an individual tile image
    // failing to load — those fall back to procedural placeholders inside
    // `packLoader.ts`, and that fallback is load-bearing, not a bug to guard
    // against here.
    const toLoad = publishedPacks.value.filter((p) => !loadedRuntimes.value.has(p.pack_id));
    await Promise.all(
      toLoad.map(async (pack) => {
        try {
          loadedRuntimes.value.set(pack.pack_id, await loadLibraryPack(pack));
        } catch (e) {
          if (pack.pack_id === currentPackId.value) {
            packLoadError.value = e instanceof Error ? e.message : String(e);
          }
        }
      }),
    );
    const customToLoad = campaignPacks.value.filter((pack) =>
      pack.status === "ready" && !loadedRuntimes.value.has(pack.pack_id)
    );
    await Promise.all(customToLoad.map(async (pack) => {
      try {
        loadedRuntimes.value.set(pack.pack_id, await loadUserPack(pack));
      } catch (error) {
        if (pack.pack_id === currentPackId.value) {
          packLoadError.value = error instanceof Error ? error.message : String(error);
        }
      }
    }));
  }

  watch(publishedPacks, () => { void ensurePackLoaded(); });
  watch(campaignPacks, () => { void ensurePackLoaded(); });
  onMounted(() => {
    void ensurePackLoaded();
  });

  return {
    activeCampaignId, selectablePacks, currentPackId, hasPublishedPacks, firstPublishedPackId, packLoadError,
    loadedRuntimes, packRuntime, awaitingDefaultPack, packLabel,
  };
}
