<template>
  <div
    class="flex flex-col gap-2 rounded-md border px-3 py-2"
    :class="stale ? 'border-tone-caution/50 bg-tone-caution/10' : 'border-border bg-card'"
  >
    <div class="flex items-start gap-2">
      <component
        :is="stale ? IconWarning : IconMap"
        class="mt-0.5 h-4 w-4 shrink-0"
        :class="stale ? 'text-ink-caution' : 'text-muted-foreground'"
        aria-hidden="true"
      />
      <div class="min-w-0 flex-1">
        <p v-if="stale" class="font-cinzel text-xs font-semibold text-ink-caution">
          The drawing moved on — map rev {{ map?.rev }}, published rev {{ site.map_published_rev }}
        </p>
        <p v-else class="truncate font-cinzel text-xs font-semibold text-foreground">
          Drawn in Cartographer<template v-if="map"> — "{{ map.name }}"</template>
        </p>
        <p class="text-caption-sm text-muted-foreground">
          <template v-if="stale">{{ staleSummary }}</template>
          <template v-else>
            Published {{ timeAgo(site.updated_at) }}
            <template v-if="site.map_published_rev !== null"> · rev {{ site.map_published_rev }}</template>
            <template v-if="derivedSummary"> · {{ derivedSummary }}</template>
          </template>
        </p>
      </div>
    </div>

    <div class="flex flex-wrap gap-1.5 pl-6">
      <AppButton v-if="!stale" variant="outline" size="xs" label="Edit map" :to="editUrl" />
      <AppButton v-if="stale" variant="outline" size="xs" label="Preview" :to="publishUrl" />
      <AppButton :variant="stale ? 'primary' : 'outline'" size="xs" label="Re-publish" :to="publishUrl" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * "Drawn in Cartographer" strip (#868, frames 02/03) — today `source_map_id`
 * only produces a link; this also says how stale the publish is. Two states:
 * fresh (this site's last publish carries the drawing's current rev) and
 * stale (the drawing moved on since). `LocationDetailSections` mounts
 * whichever state currently applies above the Rooms panel; `AtlasPlacePane`
 * additionally mounts this above the map itself, but only for the stale
 * variant — a fresh strip has nothing urgent enough to repeat there.
 *
 * `site.updated_at` stands in for "last published at": there is no dedicated
 * publish-timestamp column, and `usePublishedSites.ts` (the Cartographer's
 * own "published to" rail) already reads the same field for the same
 * purpose, so this reuses rather than invents a second convention.
 *
 * `Edit map`/`Preview`/`Re-publish` all route through the Cartographer at
 * `/cartographer/:id`, `Re-publish`/`Preview` adding `?publishTo=<siteId>` so
 * it opens straight into this site's publish review (S10's query contract).
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { deriveStructure } from "@/cartographer/structure";
import { IconMap, IconWarning } from "@/lib/icons";
import { timeAgo } from "@/lib/utils";
import type { PublishStaleness } from "@/lib/locations/siteReadiness";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { Location } from "@/types/location.types";

const { site, map, staleness } = defineProps<{
  site: Pick<Location, "id" | "name" | "source_map_id" | "map_published_rev" | "updated_at">;
  map: Pick<DungeonMap, "name" | "rev" | "layers" | "metadata"> | null | undefined;
  staleness: PublishStaleness | null;
}>();

const stale = computed(() => !!staleness);

const editUrl = computed(() => `/cartographer/${site.source_map_id}`);
const publishUrl = computed(() => `/cartographer/${site.source_map_id}?publishTo=${site.id}`);

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const derivedSummary = computed(() => {
  if (!map) return null;
  const structure = deriveStructure(map);
  return `${plural(structure.spaces.length, "space")}, ${plural(structure.ways.length, "way")} out derived`;
});

const staleSummary = computed(() => {
  if (!staleness) return "";
  const d = staleness.delta;
  const parts: string[] = [];
  if (d.newSpaces) parts.push(`${plural(d.newSpaces, "new space")}`);
  if (d.changedSpaces) parts.push(`${plural(d.changedSpaces, "space")} changed shape`);
  if (d.goneSpaces) parts.push(`${plural(d.goneSpaces, "space")} removed`);
  if (d.newWays) parts.push(`${plural(d.newWays, "new way")} out`);
  if (d.goneWays) parts.push(`${plural(d.goneWays, "way")} out removed`);
  return parts.length ? parts.join(" · ") : "The drawing changed since the last publish.";
});
</script>
