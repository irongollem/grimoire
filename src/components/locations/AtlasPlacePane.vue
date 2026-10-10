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
    <!--
      On a phone the action bar takes its own row (and its buttons drop to
      icons): beside the name it pushed the name out entirely and ran past the
      screen edge. The row is always there (Reveal is on every place), so the
      header is still one fixed height per width.
    -->
    <div class="flex min-h-14 flex-wrap items-start gap-3 sm:flex-nowrap">
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
          :placeholder="placeholderUrl('location')"
          class="h-full w-full object-cover"
        />
      </div>
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-heading font-bold text-foreground">
          {{ location.name || "Unnamed Location" }}
        </h2>
        <!-- "Ashmouth Undercroft · three levels" (#868, frame 06) — only
             when this site actually stacks levels; a lone site says nothing
             about levels at all. On its own line rather than an em-dash
             beside the name, which would fight the truncating title for
             room on a narrow pane. -->
        <p v-if="levelsSuffix" class="text-caption text-muted-foreground">{{ levelsSuffix }}</p>
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
        Build, not Open. The pane now renders the same body as the detail
        page, so a link to that page would lead somewhere the reader already
        is; the only thing left up there that this surface cannot do is
        change the place. Every place has Build (#958) and Details
        (name/description/type — the Edit form); Run is a site's alone.
        Build owns the map: on a site the workbench (#884), on any other
        place the Picture and its pins.
      -->
      <!--
        Below sm this is its own full-width row of 44px thumb targets
        (`size="md"`), stretched so Reveal — whose size its own primitive owns
        — grows to the same height as the rest. Above sm it is the compact row
        beside the name it always was. Build is outline while browsing and
        turns primary as "Done" while building: the loud button is the way
        out of a mode, not the way into one, because a phone landing in Build
        by accident and having to edit a map it only wanted to read is the
        complaint this answers (4 Oct 2026).
      -->
      <div class="flex w-full shrink-0 items-stretch gap-2 sm:w-auto sm:items-center sm:gap-1.5">
        <!--
          Reveal sits beside Build/Details because revealing is not editing: it
          is the thing a DM does mid-session, and it should never cost a trip
          through the full edit form.
        -->
        <LocationRevealControl :location="location" />
        <!--
          This place's ambience, on request; it keeps playing after the DM
          selects another place or leaves the Atlas entirely (see
          useAmbiencePlayback). Icon-only: the pane is as wide as the tree
          leaves it, and with Reveal, Build, Run and Details beside it a
          labelled button squeezed the place's own name to three letters.
          The tooltip names the scene, and `active` shows it is playing.
        -->
        <AppButton
          v-if="previewAmbience"
          variant="outline"
          :size="actionSize"
          :icon="previewing ? IconStop : IconMusicNote"
          icon-size="md"
          :active="previewing"
          :aria-label="previewing ? 'Stop ambience' : 'Play ambience'"
          :tooltip="previewTooltip"
          class="max-sm:flex-1"
          @click="previewing ? stopPreview() : startPreview()"
        />
        <!-- The site runner (#791, epic #780) — one surface to run a
             dungeon at the table, entered in place rather than by leaving
             the Atlas. Only a site has anything to run. -->
        <AppButton
          v-if="isSite"
          variant="outline"
          :size="actionSize"
          :icon="IconPlay"
          icon-size="md"
          label="Run"
          aria-label="Run"
          tooltip="Run"
          collapse-label-on-mobile
          class="max-sm:flex-1"
          @click="openRun"
        />
        <AppButton
          variant="outline"
          :size="actionSize"
          :icon="IconEdit"
          icon-size="md"
          label="Details"
          aria-label="Details"
          tooltip="Details"
          collapse-label-on-mobile
          class="max-sm:flex-1"
          @click="openEdit"
        />
        <!--
          Build is a state of this pane, not a trip to another page: the
          Atlas IS the place's workbench (#884, decision 2), and sending the
          DM away to build would reintroduce exactly the round trip this
          epic removes. `Done` drops the flag and leaves them where they are.
          Last, and the one action that keeps its word on a phone: it is the
          only one that changes what every control below it does.
        -->
        <AppButton
          :variant="building ? 'primary' : 'outline'"
          :size="actionSize"
          :icon="building ? IconCheck : IconTool"
          icon-size="md"
          :label="building ? 'Done' : 'Build'"
          :aria-label="building ? 'Done' : 'Build'"
          :tooltip="building ? 'Leave Build' : 'Build: edit the map and its rooms'"
          class="max-sm:flex-[1.6]"
          @click="toggleBuild"
        />
      </div>
    </div>

    <!-- Whether this place is one of its parent's floors, assigned by the DM
         rather than inferred (#884, migration `20260928195128`) — a
         structural control, so Build only. Offered whenever both ends of the
         relationship are site-tier, which is everything `is_level` can hold. -->
    <SiteLevelAssignment
      v-if="building && parentSite"
      :location="location"
      :parent-name="parentSite.name"
      class="mt-2"
    />

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
    <!--
      The meter and the layer bar sit beside the tabs only where there is
      room for both (xl, "beside the scale rail on the Contents/Map row", #868
      frame 02). Narrower, they take their own line under the tabs: laid over
      a full-width tab bar, five pills wrapped onto it and buried Overview and
      Map underneath them on every phone (4 Oct 2026).
    -->
    <!--
      On a phone the readiness meter is not shown at all (4 Oct 2026, the
      maintainer: "it's so busy with things there"). Its five pills are a
      prep checklist, and readiness is fixed in Build, at a desk; on a phone
      the Map tab is already the way to the map the Mapped pill used to be.
      A site with neither map nor Build then has nothing left in this row, so
      the row itself hides with it.
    -->
    <div
      v-if="hasMap || isSite || building"
      class="relative mb-3 flex flex-col gap-2"
      :class="{ 'max-sm:hidden': !(hasMap || building) }"
    >
      <!--
        Reachable while building even with no layer yet (#884, S5; every
        place since #958) — Build on a mapless place is exactly when the DM
        needs Map mode, to see the Layers panel that starts the first one, and
        on a battle map (which Browse hides) to unflag it. Browsing a mapless
        place has nothing to switch to, so the toggle stays hidden there.
      -->
      <!-- Real tabs, not a small segmented toggle: Overview and Map are two
           views of the place, and the toggle was easy to miss entirely. -->
      <TabBar
        v-if="hasMap || building"
        :tabs="MODE_TABS"
        :model-value="paneMode"
        wrapper-class="w-full"
        @update:model-value="$emit('update:paneMode', $event)"
      />
      <SiteReadinessMeter
        v-if="isSite && paneMode === 'places'"
        :readiness="siteReadiness"
        :class="['max-sm:hidden', hasMap || building ? 'xl:absolute xl:right-0 xl:top-1.5' : '']"
        @open-map="onOpenMap"
      />
      <AtlasSiteLayerBar
        v-if="isSite && hasMap && paneMode === 'map'"
        :location="location"
        :layers="siteImageLayers"
        class="xl:absolute xl:right-0 xl:top-1.5"
      />
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      <!--
        `relative` so the zoom overlay AtlasSiteMapMode renders can sit
        exactly on the map frame the reader is already looking at, instead of
        being measured into place.

        `building` alone (no `hasMap`) reaches this on any place (#958): a
        mapless world or a battle map is exactly what Build's Layers panel is
        for. Browsing one still never lands here, since `hasMap` gates it.
      -->
      <AtlasSiteMapMode
        :building="building"
        v-if="(hasMap || building) && paneMode === 'map'"
        :location="location"
        :index="index"
        :children="children"
        @select="$emit('select', $event)"
        @descend="$emit('select', $event)"
      />

      <template v-else>
        <!-- What the place is first (description, people, notes), then what is
             inside it: the child list used to come first and push the
             interesting content below the fold. -->
        <LocationDetailSections ref="sectionsRef" :location="location" :building="building" />

        <!--
          Children grouped by scale rather than laid out as equal cards. This is
          the part that has to carry the pane for a DM with no artwork at all,
          so it leans on the taxonomy instead of on images.
        -->
        <section v-for="(group, gi) in groups" :key="group.label" class="pb-3" :class="gi === 0 && sections?.hasSubstance ? 'mt-4 border-t border-border pt-4' : ''">
          <h3
            class="pb-1 text-label-lg font-semibold text-muted-foreground"
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


        <p
          v-if="!groups.length && !sections?.hasSubstance"
          class="py-6 text-center text-body text-muted-foreground italic"
        >
          Nothing inside {{ location.name }} yet.
        </p>
      </template>

      <!--
        One box for Browse, Build and both pane modes: it sits after the
        mode switch so it stays mounted while the DM flips between them. The
        edit form is the one state that replaces this pane, so AtlasExplorer
        mounts the same box under it (#983).
      -->
      <div class="mt-4 border-t border-border pt-4">
        <DmNoteBox type="location" :id="location.id" :label="location.name" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import TabBar from "@/components/common/controls/TabBar.vue";
import AtlasScaleRail from "@/components/locations/AtlasScaleRail.vue";
import AtlasSiteMapMode from "@/components/locations/AtlasSiteMapMode.vue";
import AtlasTreeRow from "@/components/locations/AtlasTreeRow.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import LocationDetailSections from "@/components/locations/LocationDetailSections.vue";
import LocationRevealControl from "@/components/locations/LocationRevealControl.vue";
import SiteLevelAssignment from "@/components/locations/SiteLevelAssignment.vue";
import AtlasSiteLayerBar from "@/components/locations/AtlasSiteLayerBar.vue";
import SiteReadinessMeter from "@/components/locations/SiteReadinessMeter.vue";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useBeatsStagedAt } from "@/composables/quests/useBeatsStagedAt";
import { useAmbiencePlayback } from "@/composables/locations/useAmbiencePlayback";
import { useBelow } from "@/composables/useBreakpoint";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconEdit,
  IconLayers,
  IconLocation,
  IconMap,
  IconMusicNote,
  IconPlay,
  IconQuest,
  IconStop,
  IconTool,
} from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { resolveInheritedTheme } from "@/lib/locations/ambience";
import { isLocationOutOfEra } from "@/lib/locations/era";
import { levelOrdinal, levelsOf } from "@/lib/locations/levels";
import { buildMapStack, hasAnyMapLayer } from "@/lib/locations/mapStack";
import { visibleTags } from "@/lib/locations/tags";
import { groupByTier, isInteriorType, isSiteType, occupiedTiers } from "@/lib/locations/tiers";
import type { LocationTier, TierGroup } from "@/lib/locations/tiers";
import { ancestorPath, childrenOf, descendantsOf } from "@/lib/locations/tree";
import type { AtlasIndex, AtlasRow } from "@/lib/locations/tree";
import { LOCATION_TYPE_COLORS, LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Location, LocationSummary } from "@/types/location.types";

const { index, location, paneMode, todayYear } = defineProps<{
  index: AtlasIndex;
  location: Location | null;
  paneMode: "places" | "map";
  todayYear: number;
}>();

const emit = defineEmits<{ select: [id: string]; "update:paneMode": [mode: "places" | "map"] }>();

const MODE_TABS = [
  { id: "places", label: "Overview", icon: IconLocation },
  { id: "map", label: "Map", icon: IconMap },
] as const;

// "Nothing inside here yet" must mean *nothing* — no sub-places and no body.
// The shared sections component owns that second half, so ask it rather than
// re-deriving six queries' worth of emptiness here.
const sections = useTemplateRef("sectionsRef");

// A `tavern` tag beside a Tavern badge says nothing twice. Legacy rows typed
// `building` and tagged "tavern" keep theirs — there the tag is the meaning.
const shownTags = computed(() => (location ? visibleTags(location) : []));

const trail = computed(() => (location ? ancestorPath(index, location.id) : []));

const children = computed(() => (location ? childrenOf(index, location.id) : []));

const isSite = computed(() => !!location && isSiteType(location.location_type));

/** The site-tier parent, when there is one — the only shape `is_level` can
 *  ever hold (`guard_location_room_parent`), so it also gates the assignment
 *  control below. */
const parentSite = computed<LocationSummary | null>(() => {
  if (!location?.parent_id) return null;
  const parent = index.byId.get(location.parent_id);
  return parent && isSiteType(parent.location_type) ? parent : null;
});

/** "Ashmouth Undercroft · three levels" (#868, frame 06) — the site itself is
 *  level 1, so a stack of N child sites reads as N + 1 levels; null (no
 *  suffix at all) for a site with no levels to stack. */
const levelsInfo = computed(() => (location ? levelsOf(index, location) : null));
const levelsSuffix = computed(() => {
  const info = levelsInfo.value;
  return info && location && info.container.id === location.id ? `${info.levels.length} levels` : null;
});

// ── Ambient audio ─────────────────────────────────────────────────────────
// A place's ambience plays when the DM asks for it ("Play ambience"), in or
// out of a session, and keeps playing after they select another place —
// `useAmbiencePlayback` reads what's on right off the trigger bus's own
// ownership list, so this button and the floating player can never disagree.
// It inherits (#868): a themeless room plays what the party would hear there.
// `index.byId` already carries every location, this one included, so there
// is no separate index to build the way the old full-page sheet had to.
const ambience = useAmbiencePlayback();

/** This place's theme, or its nearest ancestor's — only when the soundboard
 *  actually has something that answers it, so the button never does nothing. */
const previewAmbience = computed(() => {
  if (!location) return null;
  const resolved = resolveInheritedTheme(location.id, index.byId);
  if (!resolved.theme || !resolved.from) return null;
  if (ambience.targetFor(resolved.theme) === null) return null;
  return { theme: resolved.theme, from: resolved.from };
});
const previewTooltip = computed(() => {
  const preview = previewAmbience.value;
  if (!preview || !location) return undefined;
  const verb = previewing.value ? "Stop ambience" : "Play ambience";
  return preview.from.id === location.id
    ? `${verb}: ${preview.theme}`
    : `${verb}: ${preview.theme} (from ${preview.from.name})`;
});
const previewing = computed(() => {
  const preview = previewAmbience.value;
  return preview !== null && ambience.isPlaying(preview.from.id);
});

function startPreview(): void {
  const preview = previewAmbience.value;
  if (!preview || !location) return;
  ambience.play({ themeOwnerId: preview.from.id, theme: preview.theme, label: location.name });
}

function stopPreview(): void {
  ambience.stop();
}

// Which image layers this place actually has, for the Show bar's Picture and
// Drawing pills (#884). `buildMapStack` is the one reader of the stack's
// columns; this is that answer narrowed to two booleans.
const siteImageLayers = computed(() => {
  const stack = buildMapStack(location);
  return { picture: !!stack.picture, drawing: !!stack.drawing };
});

// Build is a route flag like `at` is (#884) — so Back leaves Build the way it
// leaves a place, a deep link opens a place ready to work on, and a reload
// keeps the DM where they were. True on any place (#958): a site's Build is
// the workbench, any other place's is its Picture and pins.
const route = useRoute();
const router = useRouter();
// 44px thumb targets on a phone, the compact row beside the name above sm.
const isBelowSm = useBelow("sm");
const actionSize = computed(() => (isBelowSm.value ? "md" : "sm"));
const building = computed(() => route.query.build === "true");

function toggleBuild(): void {
  if (building.value) {
    const { build: _leaving, ...rest } = route.query;
    void router.push({ query: rest });
    return;
  }
  void router.push({ query: { ...route.query, build: "true" } });
}

// Build's affordances live on the map (rooms, doors, regions, the picture,
// pins), so Build always shows the map: pressed here, or arrived at by a link or a
// refresh with `build=true` already in the address.
watch(
  building,
  (isBuilding) => {
    if (isBuilding && paneMode !== "map") emit("update:paneMode", "map");
  },
  { immediate: true },
);

/** Details — a route flag on the current Atlas selection, same
 *  convention as `build` above, rather than a trip to a separate page: the
 *  pane renders the same body a full page would, so leaving it changed
 *  nothing but which page the DM was dropped on. */
function openEdit(): void {
  void router.push({ query: { ...route.query, edit: "true" } });
}

/** The site runner (#791, epic #780) — same convention. */
function openRun(): void {
  void router.push({ query: { ...route.query, run: "true" } });
}

/** The readiness meter's Mapped pill (#884, S5) — always lands on the Map.
 *  A site that has a map opens it to read, in Browse: the pill is the
 *  likeliest way a DM finds the map on a phone, and dropping them into Build
 *  for it made viewing a map cost leaving an editor (4 Oct 2026). Only a site
 *  with nothing to look at yet enters Build, where the Layers panel starts
 *  one. Never leaves Build if the DM was already in it: only `toggleBuild`'s
 *  own button should ever turn Build off. */
function onOpenMap(): void {
  if (!building.value && !hasMap.value) void router.push({ query: { ...route.query, build: "true" } });
  emit("update:paneMode", "map");
}

// ── Readiness (#868, S6) — the meter reads the core of `useSiteStructure`;
//    the layer bar's tallies live in `AtlasSiteLayerBar`, mounted in map mode
//    only (#972). ────
const siteStructureLocation = computed(() => (isSite.value ? location : null));
const { readiness: siteReadiness } = useSiteStructure(siteStructureLocation);

// ── Quests staged here (#868, frame 02) — the site itself, or any of its
//    own interior spaces (rooms, and #886's `grounds`); not deeper levels,
//    which are a different place to stage at.
const interiorIds = computed(() =>
  children.value.filter((c) => isInteriorType(c.location_type)).map((c) => c.id),
);
const questStageSpaceIds = computed(() => (location ? [location.id, ...interiorIds.value] : []));
const { data: stagedQuestBeats } = useBeatsStagedAt(questStageSpaceIds);
const stagedQuestCount = computed(() => new Set((stagedQuestBeats.value ?? []).map((b) => b.quest_id)).size);

/**
 * On a site-tier place, `LocationDetailSections` mounts `SiteRoomsPanel`
 * below — an ordered, editable view of the same interior children (rooms,
 * and #886's `grounds`). Grouping them into an "Interiors" tile here too
 * would render every one of them twice, in two different orders (this list
 * is scale-then-name; the panel is the DM's manual `sort_order`). Every
 * other tier still groups normally.
 */
const groups = computed(() => {
  const kids = location && isSiteType(location.location_type)
    ? children.value.filter((c) => !isInteriorType(c.location_type))
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
const hasMap = computed(() => hasAnyMapLayer(location) && !location?.is_battle_map);

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
 * "Level N" for a child the DM has assigned as one of this site's floors
 * (`is_level`, #868 frame 02, formalised by migration `20260928195128`) — N
 * is the child's 1-based position in `levelsOf`'s list, which is `location`
 * itself (level 1) followed by its `is_level` children in `compareSiblings`
 * order. Shared with the Map-mode rail (`AtlasSiteMapMode`, `SiteLevelsColumn`)
 * so Contents mode and Map mode never disagree on the same page — they used
 * to, because this chip numbered `group.locations` on its own, which excludes
 * the parent the rail counts as level 1.
 */
function levelChipFor(group: TierGroup, child: LocationSummary): number | null {
  if (!isSite.value || group.tier !== "site" || !location) return null;
  const info = levelsInfo.value;
  return info ? levelOrdinal(info.levels, child.id) : null;
}

function rowFor(child: LocationSummary): AtlasRow {
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
