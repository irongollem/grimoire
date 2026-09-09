<template>
  <div class="flex w-full flex-col gap-3 lg:w-40 lg:shrink-0">
    <SiteLevelsRail :levels="levelSummaries" :active-id="location.id" @select="$emit('select', $event)" />

    <SiteWaysOutPanel :site-id="location.id" :spaces="siteSpaces" vertical-only />

    <div class="rounded-md border border-border bg-card px-3 py-2 text-caption text-muted-foreground">
      <p class="mb-1 font-cinzel text-2xs font-semibold uppercase tracking-wide text-foreground">
        Rules we keep
      </p>
      <ul class="list-disc space-y-2 pl-4">
        <li>
          Direct children only
          <p class="text-caption-sm text-muted-foreground/70">
            A region binds to a child of the site it is drawn on — the DB guard already refuses a
            grandchild, so the picker never offers one.
          </p>
        </li>
        <li>
          One map per place
          <p class="text-caption-sm text-muted-foreground/70">
            A level has its own map_url. Multi-floor in one drawing stays a drawing; the Atlas needs a
            place per floor to hold rooms and state.
          </p>
        </li>
        <li>
          Depth is not new nesting
          <p class="text-caption-sm text-muted-foreground/70">
            Sites already nest arbitrarily. "Level" is a reading of the existing tree, not a new parent
            kind.
          </p>
        </li>
      </ul>
    </div>

    <SiteLevelReusePanel
      v-if="levelsContainer"
      :container-id="levelsContainer.id"
      :container-campaign-id="levelsContainer.campaign_id"
      :level-type="levelsContainer.location_type"
      :current-level="location"
      :next-level-number="levelSites.length + 1"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The Atlas's "levels" sidebar (#868, frame 06) — the rail, the vertical
 * ways-out panel and its "Rules we keep" note, and the reuse panel, as one
 * column rather than three pieces scattered across a map's layout. Extracted
 * from `AtlasSiteMapMode` (which still owns the map itself and the trail
 * line above it) so `LocationSheet` — the page most links actually land on —
 * can mount the same sidebar beside its own read-only map.
 *
 * `AtlasSiteMapMode` hands this component an `AtlasIndex` for free, but
 * `LocationSheet` has none — it only ever fetches one place's children at a
 * time. Rather than forcing every caller to assemble an index just to pass
 * one in, this component builds its own from `useAllLocations()`: cheap,
 * since that query is already warm everywhere else an ancestor chain is
 * shown, and it keeps the prop surface to exactly what a caller always has
 * on hand — the place being looked at, and that place's own children.
 */
import { computed } from "vue";
import SiteLevelReusePanel from "@/components/locations/SiteLevelReusePanel.vue";
import SiteLevelsRail from "@/components/locations/SiteLevelsRail.vue";
import type { SiteLevelSummary } from "@/components/locations/SiteLevelsRail.vue";
import SiteWaysOutPanel from "@/components/locations/SiteWaysOutPanel.vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import { buildAtlasIndex, childrenOf } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const { location, children } = defineProps<{
  location: Location;
  /** This place's own children — used both to find its own child sites and,
   *  via `bindableSpaces`, to scope its vertical ways-out panel. */
  children: Location[];
}>();

defineEmits<{ select: [id: string] }>();

const { data: allLocations } = useAllLocations();
const index = computed(() => buildAtlasIndex(allLocations.value ?? []));

const childSites = computed(() => children.filter((c) => isSiteType(c.location_type)));

/** Whose children the rail is listing — this site's own, or its parent's,
 *  when this place has no levels of its own but IS one (#868, S6). */
const levelsContainer = computed<Location | null>(() => {
  if (childSites.value.length > 0) return location;
  if (!location.parent_id) return null;
  const parent = index.value.byId.get(location.parent_id);
  return parent && isSiteType(parent.location_type) ? parent : null;
});

const levelSites = computed<Location[]>(() => {
  if (childSites.value.length > 0) return [location, ...childSites.value];
  const container = levelsContainer.value;
  return container ? childrenOf(index.value, container.id).filter((c) => isSiteType(c.location_type)) : [];
});

const levelRoomIdsByLevel = computed(() => {
  const byLevel = new Map<string, string[]>();
  for (const level of levelSites.value) {
    byLevel.set(
      level.id,
      childrenOf(index.value, level.id)
        .filter((c) => c.location_type === "room")
        .map((c) => c.id),
    );
  }
  return byLevel;
});
const allLevelRoomIds = computed(() => [...levelRoomIdsByLevel.value.values()].flat());
const { stateOf: levelRoomStateOf } = useLocationStateForRooms(allLevelRoomIds);

const levelSummaries = computed<SiteLevelSummary[]>(() =>
  levelSites.value.map((level) => {
    const roomIds = levelRoomIdsByLevel.value.get(level.id) ?? [];
    return {
      id: level.id,
      name: level.name,
      mapUrl: level.map_url,
      roomCount: roomIds.length,
      clearedCount: roomIds.filter((id) => levelRoomStateOf(id, "cleared")?.value).length,
      exploredCount: roomIds.filter((id) => levelRoomStateOf(id, "explored")?.value).length,
    };
  }),
);

const siteSpaces = computed(() => bindableSpaces(children));
</script>
