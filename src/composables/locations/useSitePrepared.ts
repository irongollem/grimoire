// Everything the Prepared layer needs for one site (#868, S8, frame 10).
//
// `resolvePreparedMarks` (`@/lib/locations/preparedMarks.ts`) is pure — this
// composable is the one place that gathers the live rows it takes: every
// placement across the site's rooms (`useSitePlacements`, S10) plus the four
// campaign-scoped catalogues a placement's `*_id` points into. Traps,
// features, puzzles, encounters and loot are fetched for the whole campaign
// (the same lists Dungeon Craft's own tabs already hold in cache) rather than
// filtered to this site first — resolution already drops anything that
// doesn't anchor into `spaceIds`/`regions`, so a second filter here would
// just be the same rule written twice.

import { computed } from "vue";
import type { Ref } from "vue";
import { useSitePlacements } from "@/composables/locations/useSitePlacements";
import { useTrapResolver } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatureResolver } from "@/composables/dungeon-features/useDungeonFeatures";
import { usePuzzles } from "@/composables/dungeon-features/usePuzzles";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { PREPARED_MARK_KINDS, resolvePreparedMarks } from "@/lib/locations/preparedMarks";
import type { PreparedMark, PreparedMarkKind } from "@/lib/locations/preparedMarks";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

export interface SitePrepared {
  marks: Ref<PreparedMark[]>;
  /** Feeds the layer bar's "Prepared" pill and the legend counts named in
   *  frame 10 ("3 traps · 4 features · 2 puzzles · 2 encounters · 1 loot
   *  cache") — every kind present even at zero, same convention as
   *  `LocationMap.vue`'s existing `layerCounts`. */
  counts: Ref<Record<PreparedMarkKind, number>>;
}

/**
 * `spaceIds` and `regions` are the same site data `LocationMap.vue` already
 * holds for `MapRegionsLayer` — no `siteId` parameter, because nothing here
 * needs one: `useSitePlacements` keys off `spaceIds` directly, and the four
 * catalogue composables are campaign-scoped internally.
 */
export function useSitePrepared(spaceIds: Ref<string[]>, regions: Ref<LocationMapRegion[]>): SitePrepared {
  const { data: placements } = useSitePlacements(spaceIds);
  // Resolving stored ids: every library and own row, unshadowed and across
  // every campaign scope, so a placed trap still draws after it is re-scoped.
  // Only the library rows this site cites are read: placements' library columns and
  // a hazard zone's linked trap.
  const { byId: trapsById } = useTrapResolver(
    () => ({ includeAllScopes: true }),
    () => [
      ...(placements.value ?? []).map((p) => p.library_trap_id),
      ...regions.value.map((r) => r.zone_payload.trap_id),
    ],
  );
  const { byId: featuresById } = useDungeonFeatureResolver(
    () => ({ includeAllScopes: true }),
    () => (placements.value ?? []).map((p) => p.library_dungeon_feature_id),
  );
  const { data: puzzles } = usePuzzles();
  const { data: encounters } = useEncounters();
  const { data: lootPlacements } = useLootPlacements();

  const marks = computed<PreparedMark[]>(() =>
    resolvePreparedMarks({
      placements: placements.value ?? [],
      traps: [...trapsById.value.values()],
      features: [...featuresById.value.values()],
      puzzles: puzzles.value ?? [],
      encounters: encounters.value ?? [],
      lootPlacements: lootPlacements.value ?? [],
      regions: regions.value,
    }),
  );

  const counts = computed<Record<PreparedMarkKind, number>>(() => {
    const tally = Object.fromEntries(PREPARED_MARK_KINDS.map((kind) => [kind, 0])) as Record<PreparedMarkKind, number>;
    for (const mark of marks.value) tally[mark.kind] += 1;
    return tally;
  });

  return { marks, counts };
}
