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
    -->
    <SegmentedControl
      v-if="hasMap"
      :model-value="paneMode"
      :options="MODE_OPTIONS"
      size="xs"
      class="mb-3 self-start"
      @update:model-value="$emit('update:paneMode', $event)"
    />

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <!--
        `relative` so the zoom overlay can sit exactly on the map frame the
        reader is already looking at, instead of being measured into place.
      -->
      <div v-if="hasMap && paneMode === 'map'" class="relative">
        <LocationMap
          :map-url="location.map_url!"
          :pins="location.map_pins"
          :children="children"
          mode="view"
          show-hidden-pins
          compact
          :offer-peek="false"
          @pin-click="descendTo"
          @pin-go="descendTo"
          @pin-watch="descendTo"
        />

        <!--
          Up one level, in the map's own idiom. Placed on the map rather than in
          the breadcrumb because it is the reverse of the gesture that got you
          here, and it should be where that gesture happened.
        -->
        <AppButton
          v-if="ascendTarget && !zoomPlan"
          variant="subtle"
          size="xs"
          class="absolute top-2 left-2 z-30 max-w-56 bg-background/85 backdrop-blur-sm"
          :icon="IconChevronUp"
          :label="`Up to ${ascendTarget.name}`"
          @click="ascend"
        />

        <AtlasMapZoom
          v-if="zoomPlan"
          :plan="zoomPlan"
          :settling="zoomSettling"
          compact
          @done="finishDescent"
        />
      </div>

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
            <li v-for="child in group.locations" :key="child.id">
              <AtlasTreeRow
                :row="rowFor(child)"
                :expanded="false"
                :selected="false"
                :show-expander="false"
                :out-of-era="isLocationOutOfEra(child, todayYear)"
                @select="$emit('select', $event)"
              />
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
import AtlasMapZoom from "@/components/locations/AtlasMapZoom.vue";
import AtlasScaleRail from "@/components/locations/AtlasScaleRail.vue";
import AtlasTreeRow from "@/components/locations/AtlasTreeRow.vue";
import LocationDetailSections from "@/components/locations/LocationDetailSections.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationRevealControl from "@/components/locations/LocationRevealControl.vue";
import { IconChevronRight, IconChevronUp, IconClock, IconEdit, IconLocation, IconMap } from "@/lib/icons";
import { isLocationOutOfEra } from "@/lib/locations/era";
import { planAscent, planDescent } from "@/lib/locations/mapZoom";
import type { ZoomPlan } from "@/lib/locations/mapZoom";
import { visibleTags } from "@/lib/locations/tags";
import { groupByTier, isSiteType, occupiedTiers } from "@/lib/locations/tiers";
import type { LocationTier } from "@/lib/locations/tiers";
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

const emit = defineEmits<{ select: [id: string]; "update:paneMode": [mode: "places" | "map"] }>();

const MODE_OPTIONS = [
  { value: "places", label: "Contents", icon: IconLocation },
  { value: "map", label: "Map", icon: IconMap },
] as const;

// "Nothing inside here yet" must mean *nothing* — no sub-places and no body.
// The shared sections component owns that second half, so ask it rather than
// re-deriving six queries' worth of emptiness here.
const sections = useTemplateRef("sectionsRef");

// A `tavern` tag beside a Tavern badge says nothing twice. Legacy rows typed
// `building` and tagged "tavern" keep theirs — there the tag is the meaning.
const shownTags = computed(() => (location ? visibleTags(location) : []));

// ── Moving between maps ───────────────────────────────────────────────────────
const zoomPlan = ref<ZoomPlan | null>(null);
const zoomSettling = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/** The parent, when rising to it can be animated. Drives the ascend control. */
const ascendTarget = computed(() => {
  if (!location?.parent_id) return null;
  const parent = index.byId.get(location.parent_id);
  return parent && planAscent(location, parent) ? parent : null;
});

/**
 * The pin's "watch" action. When both this place and the child have a map, the
 * move is animated as a continued zoom — the thing an atlas actually does —
 * and the selection is deferred until the motion lands. Otherwise it is an
 * ordinary selection, which is also what happens under reduced motion.
 */
function descendTo(childId: string) {
  start(planDescent(location, index.byId.get(childId)), childId);
}

function ascend() {
  const parent = ascendTarget.value;
  if (parent) start(planAscent(location, parent), parent.id);
}

function start(plan: ZoomPlan | null, fallbackId: string) {
  if (!plan) {
    emit("select", fallbackId);
    return;
  }
  zoomSettling.value = false;
  zoomPlan.value = plan;
}

/**
 * The motion has landed. Select — but leave the overlay up.
 *
 * Tearing it down here is what produced the jitter: the selection travels
 * through the router, so for a frame or two the *previous* map is still what is
 * mounted underneath, and it flashes through before the destination renders.
 */
function finishDescent() {
  if (zoomPlan.value) emit("select", zoomPlan.value.targetId);
}

/**
 * Retire the overlay once the destination is genuinely mounted beneath it, and
 * fade rather than cut — two maps of different aspect ratios do not occupy the
 * same box, so the last frame of the animation and the first frame of the real
 * map are never pixel-identical. A short fade covers that; a cut shows it.
 */
watch(
  () => location?.id,
  (id) => {
    const plan = zoomPlan.value;
    if (!plan) return;
    if (id !== plan.targetId) {
      // Navigated somewhere else mid-flight (tree, breadcrumb, Back) — drop it.
      clearZoom();
      return;
    }
    zoomSettling.value = true;
    settleTimer = setTimeout(clearZoom, 220);
  },
);

function clearZoom() {
  clearTimeout(settleTimer);
  zoomPlan.value = null;
  zoomSettling.value = false;
}

onBeforeUnmount(clearZoom);

const trail = computed(() => (location ? ancestorPath(index, location.id) : []));

const children = computed(() => (location ? childrenOf(index, location.id) : []));

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
