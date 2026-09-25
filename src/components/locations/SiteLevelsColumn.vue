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
 * column rather than three pieces scattered across a map's layout.
 * `AtlasSiteMapMode` mounts it beside the map, which it keeps (with the trail
 * line above it). It was extracted for a second host, the full-page location
 * sheet, and built its own place index because that page had none; the page
 * is gone (25 Sep 2026), so the index now comes from the Atlas like
 * everywhere else.
 */
import { computed } from "vue";
import SiteLevelReusePanel from "@/components/locations/SiteLevelReusePanel.vue";
import SiteLevelsRail from "@/components/locations/SiteLevelsRail.vue";
import type { SiteLevelSummary } from "@/components/locations/SiteLevelsRail.vue";
import SiteWaysOutPanel from "@/components/locations/SiteWaysOutPanel.vue";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { levelsOf } from "@/lib/locations/levels";
import { buildMapStack } from "@/lib/locations/mapStack";
import { bindableSpaces, isInteriorType } from "@/lib/locations/tiers";
import { childrenOf, type AtlasIndex } from "@/lib/locations/tree";
import type { Location } from "@/types/location.types";

const { location, index, children } = defineProps<{
  location: Location;
  /** The Atlas's own index. `levelsOf` reads child/parent sites off it,
   *  since it also needs the sibling levels above `location`. */
  index: AtlasIndex;
  /** This place's own children, used via `bindableSpaces` to scope its
   *  vertical ways-out panel. */
  children: Location[];
}>();

defineEmits<{ select: [id: string] }>();


// Shared with `AtlasSiteMapMode` and `AtlasPlacePane` so all three surfaces
// number levels the same way regardless of which level's page is open — see
// the doc comment on `levelsOf` (#868 fix: numbering used to disagree
// depending on whether the rail was reached from the container or from one
// of its own levels).
const levelsInfo = computed(() => levelsOf(index, location));

/** Whose children the rail is listing — this site's own, or its parent's,
 *  when this place has no levels of its own but IS one (#868, S6). */
const levelsContainer = computed<Location | null>(() => levelsInfo.value?.container ?? null);

const levelSites = computed<Location[]>(() => levelsInfo.value?.levels ?? []);

// `roomCount` below (feeding `SiteLevelSummary`, a type this component does
// not own) counts interior spaces — room, and #886's `grounds` — not only
// the literal `room` type, so a wilds level's cleared/explored progress
// still rolls up here the same way a dungeon level's does.
const levelRoomIdsByLevel = computed(() => {
  const byLevel = new Map<string, string[]>();
  for (const level of levelSites.value) {
    byLevel.set(
      level.id,
      childrenOf(index, level.id)
        .filter((c) => isInteriorType(c.location_type))
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
    const stack = buildMapStack(level);
    return {
      id: level.id,
      name: level.name,
      thumbnailUrl: stack.primary?.url ?? null,
      hasMap: stack.hasAnyLayer,
      roomCount: roomIds.length,
      clearedCount: roomIds.filter((id) => levelRoomStateOf(id, "cleared")?.value).length,
      exploredCount: roomIds.filter((id) => levelRoomStateOf(id, "explored")?.value).length,
    };
  }),
);

const siteSpaces = computed(() => bindableSpaces(children));
</script>
