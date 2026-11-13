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
        v-if="!lowArt"
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
          record
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
          <TagChip v-for="tag in shownTags" :key="tag">{{ tag }}</TagChip>
          <!--
            "Dungeon · tithe · flooded · [quest icon] 2 quests staged here"
            (#868, frame 02) — a beat staged at this place OR any of its
            rooms, so a DM scanning the Atlas sees a quest is waiting here
            before exploring it. Silent at zero: most places never
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
          <!-- Low art (#1179): the place's own picture waits behind a button; the sigil box above is gone. -->
          <PortraitOnRequest v-if="lowArt" :src="location.image_url" :alt="location.name" label="Picture" />
        </div>
      </div>
      <!--
        No Build and no Open: the pane renders the same body as the detail
        page did, and the map has its own tab (#1125). What is left up here
        is Reveal, ambience, Explore (a site's alone) and Details (the Edit
        form: name, description, type, and which floor this is).
      -->
      <!--
        Below sm this is its own full-width row of 44px thumb targets
        (`size="md"`), stretched so Reveal — whose size its own primitive owns
        — grows to the same height as the rest. Above sm it is the compact row
        beside the name it always was.
      -->
      <div class="flex w-full shrink-0 items-stretch gap-2 sm:w-auto sm:items-center sm:gap-1.5">
        <!--
          Reveal sits beside Details because revealing is not editing: it
          is the thing a DM does mid-session, and it should never cost a trip
          through the full edit form.
        -->
        <LocationRevealControl :location="location" />
        <!--
          This place's ambience, on request; it keeps playing after the DM
          selects another place or leaves the Atlas entirely (see
          useAmbiencePlayback). Icon-only: the pane is as wide as the tree
          leaves it, and with Reveal, Explore and Details beside it a
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
        <!-- Exploring (#1125 decision 9): the Play screen, with the party walking
             this site's map. Only a site has anything to explore. -->
        <AppButton
          v-if="isSite"
          variant="outline"
          :size="actionSize"
          :icon="IconPlay"
          icon-size="md"
          label="Explore"
          aria-label="Explore"
          tooltip="Explore this site at the table"
          collapse-label-on-mobile
          class="max-sm:flex-1"
          @click="openExplore"
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
      </div>
    </div>

    <div class="py-3">
      <AtlasScaleRail :current-type="location.location_type" :occupied="occupied" />
    </div>

    <!--
      Overview and Map are two views of every place (#1125), so the tabs are
      always here. Deliberately not `block`: stretched across the pane a
      two-option toggle shouts louder than the content it switches.

      Readiness (Overview) and the layer bar (Map) share the row where there
      is room for both (xl, "beside the scale rail on the Contents/Map row",
      #868 frame 02); narrower, they take their own line under the tabs. On a
      phone the readiness meter is not shown at all (4 Oct 2026, "it's so busy
      with things there"): its pills are a prep checklist for a desk.
    -->
    <div class="relative mb-3 flex flex-col gap-2">
      <TabBar
        :tabs="MODE_TABS"
        :model-value="paneMode"
        wrapper-class="w-full"
        @update:model-value="$emit('update:paneMode', $event)"
      />
      <SiteReadinessMeter
        v-if="isSite && paneMode === 'places'"
        :readiness="siteReadiness"
        class="max-sm:hidden xl:absolute xl:right-0 xl:top-1.5"
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
        being measured into place. A place with no map gets the empty card
        (#1125, frame 04) in the same spot.
      -->
      <template v-if="paneMode === 'map'">
        <AtlasSiteMapMode
          v-if="hasMap"
          :location="location"
          :index="index"
          :children="children"
          @select="$emit('select', $event)"
          @descend="$emit('select', $event)"
        />
        <PlaceMapEmpty v-else :location="location" :is-site="isSite" />
      </template>

      <template v-else>
        <!-- The place's picture, living or still, before anything else (#1142, frame 02). -->
        <AtlasPlacePicture :location="location" />

        <!-- A glance at the map, and the way to its tab (#1125, frame 02). -->
        <section
          v-if="hasMap && mapThumb"
          class="mb-4 flex items-center gap-3 rounded-md border border-border bg-card p-2"
          aria-label="Map"
        >
          <img :src="mapThumb" :alt="`Map of ${location.name}`" class="h-16 w-24 shrink-0 rounded object-cover" />
          <p class="min-w-0 flex-1 text-caption text-muted-foreground">{{ location.name }} has a map.</p>
          <AppButton variant="outline" size="sm" :icon="IconMap" label="Open the map tab" @click="$emit('update:paneMode', 'map')" />
        </section>

        <!-- What the place is first (description, people, notes), then what is
             inside it: the child list used to come first and push the
             interesting content below the fold. -->
        <LocationDetailSections ref="sectionsRef" :location="location" />

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
              <TagChip
                v-if="levelChipFor(group, child)"
                class="pointer-events-none absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1"
              >
                <IconLayers class="h-3 w-3 shrink-0" aria-hidden="true" />
                Level {{ levelChipFor(group, child) }}
              </TagChip>
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
        One box for both pane modes: it sits after the
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
import TagChip from "@/components/common/TagChip.vue";
import { computed, useTemplateRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import PortraitOnRequest from "@/components/common/media/PortraitOnRequest.vue";
import { useLowArt } from "@/composables/useLowArt";
import TabBar from "@/components/common/controls/TabBar.vue";
import AtlasScaleRail from "@/components/locations/atlas/AtlasScaleRail.vue";
import AtlasSiteMapMode from "@/components/locations/atlas/AtlasSiteMapMode.vue";
import PlaceMapEmpty from "@/components/locations/atlas/PlaceMapEmpty.vue";
import AtlasPlacePicture from "@/components/locations/atlas/AtlasPlacePicture.vue";
import AtlasTreeRow from "@/components/locations/atlas/AtlasTreeRow.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import LocationDetailSections from "@/components/locations/place/LocationDetailSections.vue";
import LocationRevealControl from "@/components/locations/place/LocationRevealControl.vue";
import AtlasSiteLayerBar from "@/components/locations/atlas/AtlasSiteLayerBar.vue";
import SiteReadinessMeter from "@/components/locations/site/SiteReadinessMeter.vue";
import { useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useBeatsStagedAt } from "@/composables/quests/useBeatsStagedAt";
import { useAmbiencePlayback } from "@/composables/locations/useAmbiencePlayback";
import { useBelow } from "@/composables/useBreakpoint";
import {
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
} from "@/lib/icons";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";
import { resolveInheritedTheme } from "@/lib/locations/ambience";
import { isLocationOutOfEra } from "@/lib/locations/era";
import { levelOrdinal, levelsOf } from "@/lib/locations/levels";
import { buildMapStack, hasAnyMapLayer } from "@/lib/locations/mapStack";
import { exploreRoute } from "@/lib/locations/placeRoute";
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
const { lowArt } = useLowArt();
const sections = useTemplateRef("sectionsRef");

// A `tavern` tag beside a Tavern badge says nothing twice. Legacy rows typed
// `building` and tagged "tavern" keep theirs — there the tag is the meaning.
const shownTags = computed(() => (location ? visibleTags(location) : []));

const trail = computed(() => (location ? ancestorPath(index, location.id) : []));

const children = computed(() => (location ? childrenOf(index, location.id) : []));

const isSite = computed(() => !!location && isSiteType(location.location_type));

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
const mapStack = computed(() => buildMapStack(location));
const siteImageLayers = computed(() => ({ picture: !!mapStack.value.picture, drawing: !!mapStack.value.drawing }));
/** The Overview's thumbnail: the drawing or the picture. A blank grid has no
 *  image to show, so it gets no thumbnail. */
const mapThumb = computed(() => mapStack.value.primary?.url ?? null);

const route = useRoute();
const router = useRouter();
// 44px thumb targets on a phone, the compact row beside the name above sm.
const isBelowSm = useBelow("sm");
const actionSize = computed(() => (isBelowSm.value ? "md" : "sm"));

/** Details — a route flag on the current Atlas selection (like `edit` itself),
 *  rather than a trip to a separate page: the
 *  pane renders the same body a full page would, so leaving it changed
 *  nothing but which page the DM was dropped on. */
function openEdit(): void {
  void router.push({ query: { ...route.query, edit: "true" } });
}

/** Exploring a site is the full-screen Play screen (#1125 decision 9), a route of its own. */
function openExplore(): void {
  if (!location) return;
  void router.push(exploreRoute(location.id));
}

/** The readiness meter's Mapped pill (#884, S5) opens the Map tab: a map to
 *  read, or the empty card that starts one (#1125). */
function onOpenMap(): void {
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
