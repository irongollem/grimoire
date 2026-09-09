<template>
  <div v-if="!location" class="flex flex-1 items-center justify-center p-8">
    <p class="max-w-xs text-center text-body text-muted-foreground italic">
      Pick a place to see what is inside it.
    </p>
  </div>

  <div v-else class="flex min-h-0 flex-1 flex-col">
    <!--
      Breadcrumb: every ancestor is a target, so climbing is one click.

      Always rendered and always one line high, even for a root with no
      ancestors. Wrapping (or vanishing) changes the header's height, which
      moves the map below it — and a map that starts somewhere other than where
      it finished turns the zoom into a jump cut. Long trails scroll sideways
      rather than growing downward.
    -->
    <nav
      class="atlas-trail flex h-5 items-center gap-1 overflow-x-auto whitespace-nowrap pb-0.5"
      aria-label="Ancestors"
    >
      <template v-for="(step, i) in trail.slice(0, -1)" :key="step.id">
        <AppButton
          variant="ghost"
          size="inline-xs"
          class="max-w-40 shrink-0 truncate"
          :label="step.name"
          @click="$emit('select', step.id)"
        />
        <IconChevronRight v-if="i < trail.length - 2" class="h-3 w-3 shrink-0 text-muted-foreground/50" />
      </template>
    </nav>

    <!--
      Fixed height, not content height. Everything above the map has to occupy
      the same space for every location, or the map lands at a different y than
      it left from and the zoom reads as a jump cut. That is why the sigil box
      is always rendered (placeholder when unset) rather than v-if'd away, and
      why this row has a floor.
    -->
    <div class="flex min-h-14 items-start gap-3">
      <!--
        The size must live on a wrapper, not on FocalImage itself: its root is
        `w-full h-full` and is not run through `cn()`, so a size class passed in
        does not override — it merely coexists, and `w-full` wins. This is a
        sigil or coat of arms, not the location's map; unconstrained it fills the
        pane and pushes every child row out of view.
      -->
      <div
        class="h-14 w-14 shrink-0 overflow-hidden rounded-md"
        :style="{ backgroundColor: LOCATION_TYPE_COLORS[location.location_type] + '22' }"
      >
        <FocalImage
          :src="location.image_url"
          :alt="location.name"
          format="portrait"
          :render-width="200"
          :focal-point="null"
          placeholder="/assets/placeholders/location.webp"
          class="h-full w-full object-cover"
        />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="truncate font-cinzel text-lg font-bold text-foreground">
          {{ location.name || "Unnamed Location" }}
        </h2>
        <div class="mt-0.5 flex flex-wrap items-center gap-1.5">
          <span
            class="rounded px-1.5 py-0.5 text-label font-bold"
            :style="{
              backgroundColor: LOCATION_TYPE_COLORS[location.location_type] + '22',
              color: LOCATION_TYPE_COLORS[location.location_type],
            }"
          >
            {{ LOCATION_TYPE_LABELS[location.location_type] }}
          </span>
          <span v-if="outOfEra" class="flex items-center gap-1 text-caption text-muted-foreground italic">
            <IconClock class="h-3 w-3 shrink-0" />{{ eraLabel }}
          </span>
          <!--
            Tags belong beside the type, not after the child list: below a long
            set of tier groups they are past the fold and read as debris.
          -->
          <span
            v-for="tag in shownTags"
            :key="tag"
            class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
          >
            {{ tag }}
          </span>
          <!--
            "Dungeon · tithe · flooded · [quest icon] 2 quests staged here"
            (#868, frame 02) — a beat staged at this place OR any of its
            rooms, so a DM scanning the Atlas sees a quest is waiting here
            before opening the runner. Silent at zero: most places never
            carry a staged beat, and an always-on "0 quests" would be noise
            on every other row.
          -->
          <span
            v-if="stagedQuestCount > 0"
            class="flex items-center gap-1 text-caption text-muted-foreground"
          >
            <IconQuest class="h-3 w-3 shrink-0" aria-hidden="true" />
            {{ stagedQuestCount }} quest{{ stagedQuestCount === 1 ? "" : "s" }} staged here
          </span>
        </div>
      </div>
      <!--
        Edit, not Open. The pane now renders the same body as the detail page,
        so a link to that page would lead somewhere the reader already is; the
        only thing left up there that this surface cannot do is change the place.
      -->
      <div class="flex shrink-0 items-center gap-1.5">
        <!--
          Reveal sits beside Edit because revealing is not editing: it is the
          thing a DM does mid-session, and it should never cost a trip through
          the full edit form.
        -->
        <LocationRevealControl :location="location" />
        <AppButton
          variant="outline"
          size="sm"
          :icon="IconEdit"
          label="Edit"
          :to="`/locations/${location.id}?edit=true`"
        />
      </div>
    </div>

    <div class="py-3">
      <AtlasScaleRail :current-type="location.location_type" :occupied="occupied" />
    </div>

    <!--
      Deliberately not `block`: stretched across the pane a two-option toggle
      shouts louder than the content it switches, and the map is a view of this
      place, not the point of the page.

      Readiness (Contents mode) and the layer bar (Map mode) share this same
      row — "beside the scale rail on the Contents/Map row" (#868, frame 02) —
      rather than getting a row of their own. The row itself renders whenever
      either half of it would: a site with no map yet still needs to show
      "not mapped", even though the toggle it would otherwise share the row
      with has nothing to switch between yet.
    -->
    <div v-if="hasMap || isSite" class="mb-3 flex flex-wrap items-center gap-2">
      <SegmentedControl
        v-if="hasMap"
        :model-value="paneMode"
        :options="MODE_OPTIONS"
        size="xs"
        class="self-start"
        @update:model-value="$emit('update:paneMode', $event)"
      />
      <SiteReadinessMeter
        v-if="isSite && paneMode === 'places'"
        :readiness="siteReadiness"
        class="ml-auto"
      />
      <SiteMapLayerBar
        v-if="isSite && hasMap && paneMode === 'map'"
        :counts="siteLayerCounts"
        class="ml-auto"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <!--
        `relative` so the zoom overlay AtlasSiteMapMode renders can sit
        exactly on the map frame the reader is already looking at, instead of
        being measured into place.
      -->
      <AtlasSiteMapMode
        v-if="hasMap && paneMode === 'map'"
        :location="location"
        :index="index"
        :children="children"
        v-model:active-region-id="activeRegionId"
        @select="$emit('select', $event)"
        @descend="$emit('select', $event)"
      />

      <template v-else>
        <!--
          Children grouped by scale rather than laid out as equal cards. This is
          the part that has to carry the pane for a DM with no artwork at all,
          so it leans on the taxonomy instead of on images.
        -->
        <section v-for="group in groups" :key="group.label" class="pb-3">
          <h3
            class="pb-1 font-cinzel text-label-lg font-semibold tracking-wide text-muted-foreground"
          >
            {{ group.label }}
            <span class="tabular-nums font-normal">{{ group.locations.length }}</span>
          </h3>
          <ul class="flex flex-col gap-0.5">
            <li v-for="child in group.locations" :key="child.id" class="relative">
              <AtlasTreeRow
                :row="rowFor(child)"
                :expanded="false"
                :selected="false"
                :show-expander="false"
                :out-of-era="isLocationOutOfEra(child, todayYear)"
                @select="$emit('select', $event)"
              />
              <!--
                "A nested site inside Interiors reads as a level, not as a
                stray room" (#868, frame 02) — `AtlasTreeRow` isn't ours to
                add a slot to, so the chip overlays the row it names instead
                of living inside it. `pointer-events-none` keeps it purely
                informational: the row underneath stays the whole click target.
              -->
              <span
                v-if="levelChipFor(group, child)"
                class="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground"
              >
                <IconLayers class="h-3 w-3 shrink-0" aria-hidden="true" />
                Level {{ levelChipFor(group, child) }}
              </span>
            </li>
          </ul>
        </section>

        <LocationDetailSections ref="sectionsRef" :location="location" />

        <p
          v-if="!groups.length && !sections?.hasSubstance"
          class="py-6 text-center text-body text-muted-foreground italic"
        >
          Nothing inside {{ location.name }} yet.
        </p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import AtlasScaleRail from "@/components/locations/AtlasScaleRail.vue";
import AtlasSiteMapMode from "@/components/locations/AtlasSiteMapMode.vue";
import AtlasTreeRow from "@/components/locations/AtlasTreeRow.vue";
import LocationDetailSections from "@/components/locations/LocationDetailSections.vue";
import LocationRevealControl from "@/components/locations/LocationRevealControl.vue";
import SiteMapLayerBar from "@/components/locations/SiteMapLayerBar.vue";
import SiteReadinessMeter from "@/components/locations/SiteReadinessMeter.vue";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useBeatsStagedAt } from "@/composables/quests/useBeatsStagedAt";
import { useUiStore } from "@/stores/ui";
import {
  IconChevronRight,
  IconClock,
  IconEdit,
  IconLayers,
  IconLocation,
  IconMap,
  IconQuest,
} from "@/lib/icons";
import { isLocationOutOfEra } from "@/lib/locations/era";
import { visibleTags } from "@/lib/locations/tags";
import { groupByTier, isSiteType, occupiedTiers } from "@/lib/locations/tiers";
import type { LocationTier, TierGroup } from "@/lib/locations/tiers";
import { ancestorPath, childrenOf, descendantsOf } from "@/lib/locations/tree";
import type { AtlasIndex, AtlasRow } from "@/lib/locations/tree";
import { LOCATION_TYPE_COLORS, LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { index, location, paneMode, todayYear } = defineProps<{
  index: AtlasIndex;
  location: Location | null;
  paneMode: "places" | "map";
  todayYear: number;
}>();

defineEmits<{ select: [id: string]; "update:paneMode": [mode: "places" | "map"] }>();

const MODE_OPTIONS = [
  { value: "places", label: "Contents", icon: IconLocation },
  { value: "map", label: "Map", icon: IconMap },
] as const;

// "Nothing inside here yet" must mean *nothing* — no sub-places and no body.
// The shared sections component owns that second half, so ask it rather than
// re-deriving six queries' worth of emptiness here.
const sections = useTemplateRef("sectionsRef");

const uiStore = useUiStore();

// A `tavern` tag beside a Tavern badge says nothing twice. Legacy rows typed
// `building` and tagged "tavern" keep theirs — there the tag is the meaning.
const shownTags = computed(() => (location ? visibleTags(location) : []));

onBeforeUnmount(() => {
  if (foldedTreeForMapMode) uiStore.locationsTreeCollapsed = false;
});

const trail = computed(() => (location ? ancestorPath(index, location.id) : []));

const children = computed(() => (location ? childrenOf(index, location.id) : []));

const isSite = computed(() => !!location && isSiteType(location.location_type));

// The map mode's own tracing state (AtlasSiteMapMode) — lives here rather
// than inside that component so it survives a paneMode toggle back to
// Contents and resets cleanly on selection, same as before #868 S6 split it
// out. See the watch below.
const activeRegionId = ref<string | null>(null);

// ── Readiness, staleness, layer counts (#868, S6) — one composable so the
//    meter, the source strip and the layer bar all read the same facts. ────
const siteStructureLocation = computed(() => (isSite.value ? location : null));
const { readiness: siteReadiness, layerCounts: siteLayerCounts } = useSiteStructure(siteStructureLocation);

// ── Quests staged here (#868, frame 02) — the site itself, or any of its
//    own rooms; not deeper levels, which are a different place to stage at.
const roomIds = computed(() => children.value.filter((c) => c.location_type === "room").map((c) => c.id));
const questStageSpaceIds = computed(() => (location ? [location.id, ...roomIds.value] : []));
const { data: stagedQuestBeats } = useBeatsStagedAt(questStageSpaceIds);
const stagedQuestCount = computed(() => new Set((stagedQuestBeats.value ?? []).map((b) => b.quest_id)).size);

// The tree fold already exists for exactly this — a two-pane explorer where
// the map is the pane that earns the extra width. Only fold what we found
// unfolded, and only restore what we ourselves folded: a DM who folded the
// tree on purpose before opening a site's map should find it still folded
// after leaving, not sprung back open by a pane that merely visited.
let foldedTreeForMapMode = false;
watch(
  () => paneMode === "map" && isSite.value,
  (onSiteMap) => {
    if (onSiteMap) {
      if (!uiStore.locationsTreeCollapsed) {
        uiStore.locationsTreeCollapsed = true;
        foldedTreeForMapMode = true;
      }
    } else if (foldedTreeForMapMode) {
      uiStore.locationsTreeCollapsed = false;
      foldedTreeForMapMode = false;
    }
  },
  { immediate: true },
);

// An active trace belongs to the place it was started on; carrying it into
// the next selection would reopen a stale "Tracing X" banner on an unrelated
// map, same reasoning as `npcsExpanded` in `LocationDetailSections`.
watch(
  () => location?.id,
  () => {
    activeRegionId.value = null;
  },
);

/**
 * On a site-tier place, `LocationDetailSections` mounts `SiteRoomsPanel`
 * below — an ordered, editable view of the same `room` children. Grouping
 * them into an "Interiors" tile here too would render every room twice, in
 * two different orders (this list is scale-then-name; the panel is the DM's
 * manual `sort_order`). Every other tier still groups normally.
 */
const groups = computed(() => {
  const kids = location && isSiteType(location.location_type)
    ? children.value.filter((c) => c.location_type !== "room")
    : children.value;
  return groupByTier(kids);
});

const occupied = computed<ReadonlySet<LocationTier>>(() =>
  location ? occupiedTiers(descendantsOf(index, location.id)) : new Set<LocationTier>(),
);

/**
 * Battle maps are excluded on purpose — they are tactical encounter art, not
 * geography, and the Atlas is not where a DM goes looking for one.
 */
const hasMap = computed(() => !!location?.map_url && !location.is_battle_map);

const outOfEra = computed(() =>
  location ? isLocationOutOfEra(location, todayYear) : false,
);

const eraLabel = computed(() => {
  if (!location) return "";
  const { era_start, era_end } = location;
  if (era_start && era_end) return `${era_start}–${era_end}`;
  if (era_start) return `From ${era_start}`;
  if (era_end) return `Until ${era_end}`;
  return "";
});

/**
 * "Level N" for a nested-site child of a site (#868, frame 02) — N is the
 * child's 1-based position among its site siblings, already in
 * `compareSiblings` order via `groupByTier`. Every child in the `site` tier
 * bucket of an `isSite` parent's own `groups` IS a nested site by
 * construction (`tierOf` only assigns that tier to the six site-shaped
 * types), so no extra type check is needed beyond the group itself.
 */
function levelChipFor(group: TierGroup, child: Location): number | null {
  if (!isSite.value || group.tier !== "site") return null;
  const idx = group.locations.findIndex((l) => l.id === child.id);
  return idx === -1 ? null : idx + 1;
}

function rowFor(child: Location): AtlasRow {
  const kids = index.childIds.get(child.id) ?? [];
  return {
    loc: child,
    depth: 0,
    hasChildren: kids.length > 0,
    descendantCount: index.descendantCount.get(child.id) ?? 0,
  };
}
</script>

<style scoped>
/* The trail scrolls when a hierarchy is deep; a scrollbar inside a breadcrumb
   reads as chrome, and on some platforms it also steals vertical space — which
   is the very thing this row exists to keep constant. */
.atlas-trail {
  scrollbar-width: none;
}
.atlas-trail::-webkit-scrollbar {
  display: none;
}
</style>
