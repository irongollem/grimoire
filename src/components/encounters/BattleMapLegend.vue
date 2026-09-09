<template>
  <div class="battle-map-legend" role="note" aria-label="Map legend">
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--disc" :style="{ background: PARTY_COLOR }" />
      Party — ring from the Mint
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--disc" :style="{ background: HOSTILE_COLOR }" />
      Hostile
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--disc" :style="{ background: LARGE_COLOR }" />
      Large — footprint 2, from creature size
    </span>
    <span class="legend-item">
      <span class="legend-swatch legend-swatch--disc" :style="{ background: ACTIVE_TURN_COLOR }" />
      Active turn
    </span>
    <span v-for="zone in zones" :key="zone.region.id" class="legend-item">
      <span class="legend-swatch legend-swatch--square" :style="{ background: ZONE_COLOR }" />
      {{ zone.region.label ?? "Difficult terrain" }} — difficult terrain, from the zone you traced
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * The map legend (frame 13, "under the map"). Swatch colours mirror the
 * actual rendering elsewhere rather than inventing a second palette:
 * - Party/Hostile pull the real faction defaults tokens render with
 *   (`DEFAULT_TOKEN_RING_COLOR` / `DEFAULT_FACTIONS.enemy` — "from the Mint"
 *   names `tokenRenderer.ts`, shared with The Mint's own coin printing).
 * - The zone swatch matches `BattleMapRoomFocusLayer`'s cyan zone outline.
 * - Active-turn gold mirrors `tokenRenderer.ts`'s accent, which isn't
 *   exported (that file isn't owned by this pass), so it's restated here
 *   rather than imported.
 * - "Large" has no distinct on-map highlight — footprint (cells covered) is
 *   the tell — so its swatch is a plain colour key, not a rendered colour.
 */
import { DEFAULT_TOKEN_RING_COLOR } from "@/lib/tokenRenderer";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

defineProps<{
  /** Difficult-terrain zones inside the focus room — one legend row each,
   *  named for the zone (frame 13's "Ash-fall" is one such zone's `label`,
   *  not a fixed caption). Empty when there is no focus room, or none of its
   *  zones are difficult terrain. */
  zones: { region: LocationMapRegion; battleCells: string[] }[];
}>();

const PARTY_COLOR = DEFAULT_TOKEN_RING_COLOR;
const HOSTILE_COLOR = DEFAULT_FACTIONS.find((f) => f.id === "enemy")?.color ?? "#6B1C1C";
const LARGE_COLOR = "#8b5cf6";
const ACTIVE_TURN_COLOR = "#fbbf24";
const ZONE_COLOR = "#22d3ee";
</script>

<style scoped>
.battle-map-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1rem;
  padding: 0.5rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.4);
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.legend-swatch {
  display: inline-block;
  width: 0.625rem;
  height: 0.625rem;
  flex-shrink: 0;
}
.legend-swatch--disc {
  border-radius: 9999px;
}
.legend-swatch--square {
  border-radius: 0.125rem;
}
</style>
