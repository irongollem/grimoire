<template>
  <div class="flex flex-col gap-5">
    <!-- Breadcrumb — same pattern as the editor so DMs keep their bearings
         when switching between view and edit modes. -->
    <div
      v-if="ancestors.length"
      class="flex flex-wrap items-center gap-1 text-caption text-muted-foreground"
    >
      <RouterLink to="/locations" class="hover:text-foreground transition-colors">Locations</RouterLink>
      <template v-for="anc in ancestors" :key="anc.id">
        <span class="opacity-40">/</span>
        <RouterLink :to="`/locations/${anc.id}`" class="hover:text-foreground transition-colors">{{ anc.name }}</RouterLink>
      </template>
      <span class="opacity-40">/</span>
      <span class="text-foreground">{{ location.name }}</span>
    </div>

    <!-- Action bar — Edit + Delete. Edit flips the view wrapper's ?edit=true
         query; delete is DM-dangerous so kept right-aligned separately. -->
    <div class="flex flex-wrap items-center justify-end gap-2">
      <span
        v-if="location.location_type"
        class="text-label bg-muted text-muted-foreground rounded px-2 py-0.5 capitalize"
      >{{ LOCATION_TYPE_LABELS[location.location_type] }}</span>
      <!--
        This screen had no reveal at all: looking at a place and deciding to
        show it to the party meant opening the edit form to find the switches.
      -->
      <LocationRevealControl :location="location" />
      <AppButton
        variant="destructive"
        size="md"
        :icon="IconDelete"
        label="Delete"
        :disabled="isDeleting"
        @click="onDelete"
      />
      <!-- The site runner (#791, epic #780) — one surface to run a dungeon
           at the table. Site-tier only: a room's own sheet has nothing to
           run, and every other tier has no rooms to move a party between. -->
      <AppButton
        v-if="isSiteType(location.location_type)"
        variant="outline"
        size="md"
        :icon="IconPlay"
        label="Run"
        @click="router.push({ query: { ...route.query, run: 'true' } })"
      />
      <AppButton
        variant="primary"
        size="md"
        :icon="IconEdit"
        label="Edit"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      />
    </div>

    <!-- Identity: sigil + name + tags.
         Mobile stacks (sigil above name block), desktop is side-by-side. -->
    <div class="flex flex-col gap-4 md:flex-row md:gap-6">
      <div class="w-full max-w-48 mx-auto md:mx-0 md:w-48 md:shrink-0">
        <FocalImage
          :src="location.image_url"
          :alt="location.name"
          format="portrait"
          :lightbox="true"
          placeholder="/assets/placeholders/location.webp"
          class="w-full rounded-lg border border-border overflow-hidden"
        />
      </div>
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <div class="flex flex-col gap-1">
          <h1 class="text-title font-bold text-foreground leading-tight">
            {{ location.name }}
            <!-- "Ashmouth Undercroft — three levels" (#868, frame 06) — only
                 when this site actually stacks levels; a lone site says
                 nothing about levels at all. -->
            <span v-if="levelsSuffix" class="font-fell text-body font-normal text-muted-foreground italic">
              — {{ levelsSuffix }}
            </span>
          </h1>
          <p v-if="captionText" class="text-body text-muted-foreground italic">{{ captionText }}</p>
        </div>
        <div v-if="shownTags.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in shownTags"
            :key="tag"
            class="text-label bg-muted/60 text-muted-foreground rounded px-2 py-0.5"
          >{{ tag }}</span>
        </div>
      </div>
    </div>

    <!-- Map — pins and, on a site-tier place, traced room regions, both on
         the one rendering of `location.map_url` (#807). -->
    <section v-if="location.map_url" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Map</h2>
      <div class="flex items-start gap-3">
        <!-- Frame 06's levels sidebar, reused verbatim from the Atlas
             explorer (#868, S5b) — this is the surface most links actually
             land on, so it had none of frame 06 until now. Shown whenever
             this place has levels to navigate: its own child sites, or a
             site parent that makes this place a level itself. -->
        <SiteLevelsColumn
          v-if="showLevelsColumn"
          :location="location"
          :children="children ?? []"
          @select="onLevelSelect"
        />
        <div class="min-w-0 flex-1">
          <LocationMap
            :map-url="location.map_url"
            :pins="location.map_pins ?? []"
            :children="mapPinnableChildren"
            mode="view"
            :show-hidden-pins="true"
            :location-id="location.id"
            :show-regions="isSiteType(location.location_type)"
            :regions="siteRegions"
            :spaces="siteSpaces"
            :calibration="location.grid_calibration"
            v-model:active-region-id="activeRegionId"
            @pin-click="onPinClick"
          />
        </div>
      </div>
    </section>

    <!-- Sub-locations — read-only list linking into each child. -->
    <section v-if="subLocations.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Sub-locations
        <span class="font-fell font-normal text-muted-foreground">({{ subLocations.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="child in subLocations"
          :key="child.id"
          :to="`/locations/${child.id}`"
          class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 hover:border-primary/50 transition-colors"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground truncate max-w-40">{{ child.name }}</span>
        </RouterLink>
      </div>
    </section>

    <!-- Description, Related, Store, People, Encounters, Currently Here.
         Shared verbatim with the Atlas explorer pane. -->
    <LocationDetailSections :location="location" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from "vue";
import { useRoute, useRouter, RouterLink } from "vue-router";
import { IconDelete, IconEdit, IconPlay } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { requestAudioTheme, releaseAudioTheme } from "@/lib/audio/audioTriggers";
import { useUiStore } from "@/stores/ui";
import { buildAtlasIndex } from "@/lib/locations/tree";
import { resolveInheritedTheme } from "@/lib/locations/ambience";
import {
  useLocations,
  useAllLocations,
  useDeleteLocation,
  getPinnableDescendants,
} from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import { visibleTags } from "@/lib/locations/tags";
import type { Location } from "@/types/location.types";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationDetailSections from "@/components/locations/LocationDetailSections.vue";
import LocationRevealControl from "@/components/locations/LocationRevealControl.vue";
import SiteLevelsColumn from "@/components/locations/SiteLevelsColumn.vue";

const props = defineProps<{ location: Location }>();
const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();
const ui = useUiStore();

// ── Ancestor chain, same as editor ──────────────────────────────────────────
const { data: allLocations } = useAllLocations();
// Loop extracted into a helper to keep `computed` single-return — oxlint's
// `vue/return-in-computed-property` rule reports a false positive when a while
// loop appears inside the getter body.
function buildAncestorChain(parentId: string | null | undefined, all: Location[]): Location[] {
  const chain: Location[] = [];
  if (!parentId) return chain;
  let current = all.find((l) => l.id === parentId);
  while (current && chain.length < 10) {
    chain.unshift(current);
    const nextId = current.parent_id;
    current = nextId ? all.find((l) => l.id === nextId) : undefined;
  }
  return chain;
}
const shownTags = computed(() => visibleTags(props.location));

const ancestors = computed(() =>
  buildAncestorChain(props.location.parent_id, allLocations.value ?? []),
);

// ── Children + pinnable descendants (for the map viewer) ────────────────────
const { data: children } = useLocations(props.location.id);
const mapPinnableChildren = computed(() => {
  if (!allLocations.value?.length) return [];
  return getPinnableDescendants(props.location.id, allLocations.value);
});

// ── Site regions (#807) — only ever queried for a site-tier place; the
//    empty-string id below keeps the query disabled everywhere else. ────────
const activeRegionId = ref<string | null>(null);
const isSite = computed(() => isSiteType(props.location.location_type));
const siteRegionsQuery = useLocationMapRegions(
  computed(() => (isSite.value ? props.location.id : "")),
);
const siteRegions = computed(() => siteRegionsQuery.data.value ?? []);
// Every child that can carry a shape on this map — a room, or a nested site
// such as a courtyard inside a dungeon (#818). The database decides this; the
// helper exists so the picker never offers what the guard would refuse.
const siteSpaces = computed(() => bindableSpaces(children.value ?? []));

// ── Identity row: rooms, sub-sites, levels (#868, frame 06) ─────────────────
//
// "Ashmouth Undercroft — three levels" / "Dungeon · 7 rooms · 2 sub-sites" —
// `childSites` is the same "this site's own children that are themselves
// sites" reading `SiteLevelsColumn` uses to build its rail, so the level
// count here and the rail below always agree by construction.
const roomCount = computed(() => (children.value ?? []).filter((l) => l.location_type === "room").length);
const childSites = computed(() => (children.value ?? []).filter((l) => isSiteType(l.location_type)));

/** The site itself is level 1, so a stack of N child sites reads as N + 1
 *  levels — null (no suffix at all) for a site with no levels to stack. */
const levelsSuffix = computed(() =>
  childSites.value.length > 0 ? `${childSites.value.length + 1} levels` : null,
);

const captionText = computed(() => {
  const type = props.location.location_type ? LOCATION_TYPE_LABELS[props.location.location_type] : "";
  if (!isSite.value) return type;
  const parts = [type];
  if (roomCount.value > 0) parts.push(`${roomCount.value} room${roomCount.value === 1 ? "" : "s"}`);
  if (childSites.value.length > 0) {
    parts.push(`${childSites.value.length} sub-site${childSites.value.length === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
});

/** This place has a level stack of its own, OR is itself one level of its
 *  parent's stack — either way `SiteLevelsColumn` has something to show. */
const hasSiteParent = computed(() => {
  const parent = ancestors.value.at(-1);
  return !!parent && isSiteType(parent.location_type);
});
const showLevelsColumn = computed(() => isSite.value && (childSites.value.length > 0 || hasSiteParent.value));

function onLevelSelect(id: string) {
  router.push(`/locations/${id}`);
}

/**
 * Sub-locations, minus the rooms — a site's rooms are owned by the Rooms panel
 * below (`SiteRoomsPanel`, via `LocationDetailSections`), which numbers and
 * orders them, and by the traced regions on the map above.
 *
 * Without this a dungeon lists every room twice on one page: once here as a
 * plain child and once as a numbered room. #783 made exactly this cut in the
 * Atlas tree's "Interiors" group for the same reason; this list was simply
 * missed, and stayed invisible while rooms were also pinnable, because the
 * pins made the duplication look like three views of one thing rather than
 * two lists of the same thing.
 *
 * Only on a place that *has* the Rooms panel: everywhere else a room-typed
 * child has no other home, and hiding it would lose it.
 */
const subLocations = computed(() =>
  isSite.value
    ? (children.value ?? []).filter((l) => l.location_type !== "room")
    : (children.value ?? []),
);

// ── Delete ──────────────────────────────────────────────────────────────────
const { mutateAsync: deleteLocation } = useDeleteLocation();
const isDeleting = ref(false);

async function onDelete() {
  if (!(await confirm(`Delete "${props.location.name}"? This cannot be undone.`))) return;
  isDeleting.value = true;
  try {
    router.push("/locations");
    await deleteLocation(props.location.id);
  } finally {
    isDeleting.value = false;
  }
}

// Pin click in view mode → navigate to the child location.
function onPinClick(childId: string) {
  router.push(`/locations/${childId}`);
}

// ── Ambient audio ─────────────────────────────────────────────────────────
// Opening this location tells the soundboard "an ambient theme wants to play";
// leaving it says the opposite. A release always names the location being
// *left* — naming the one being entered would have a DM walking between two
// themed rooms cancel the audio they just started.
//
// Only while no session is running (#790). Mid-session, ambience follows
// where the party actually *is* — see `usePartyAmbience`, mounted app-level —
// not whatever the DM happens to have open in the Atlas: that used to hijack
// the table's music the moment a DM clicked a different location while
// browsing. With no session running this is unchanged, and that is
// deliberate: it is the prep-time preview of the room the DM is looking at.
//
// The preview inherits too (#868), off the same `allLocations` list already
// fetched above for the breadcrumb — a DM previewing a themeless room hears
// what the party would hear there, not silence. `props.location` is merged
// in over whatever `allLocations` currently holds for that id: it is this
// sheet's own live prop, so resolving its *own* theme must never depend on
// the shared list having refetched since the last save, and a brand-new
// location may not be in that cache yet at all.
const ambienceById = computed(() => {
  const index = buildAtlasIndex(allLocations.value ?? []).byId;
  const merged = new Map(index);
  merged.set(props.location.id, props.location);
  return merged;
});

// `heldSourceId` (rather than deriving straight from `props.location.id`)
// is what lets one function answer both triggers below: a location change
// and a session starting or ending mid-browse must produce the exact same
// request-then-release behaviour, including the case where a session starts
// while this sheet is already open — the slot must be handed to the party
// immediately rather than left playing whatever the DM last browsed.
const heldSourceId = ref<string | null>(null);

function syncAmbience(loc: Location): void {
  const previous = heldSourceId.value;
  // Mid-session this previews nothing at all — the party's own position
  // (`usePartyAmbience`) owns the slot instead.
  const resolved = ui.sessionRunning
    ? null
    : resolveInheritedTheme(loc.id, ambienceById.value);
  const theme = resolved?.theme ?? null;
  // Keyed on the theme owner, not `loc.id` — same reasoning as
  // `usePartyAmbience`'s `sourceId`: two rooms previewed back to back that
  // inherit from the same ancestor must resolve to one sourceId, or the
  // second preview's release stops the scene the first one only just handed
  // off to it (`useAudioThemeTriggers` releases an ambient scene by target
  // id with no reference count).
  const next = theme && resolved ? `location:${resolved.from!.id}` : null;
  if (previous === next) return;
  // Request first, release second, and the order is load-bearing. The new
  // owner takes the ambient slot synchronously, so the release that follows
  // is recognised as stale and ignored. Releasing first would instead hand
  // the slot back to whatever preceded it and then immediately take it again
  // — an audible stop-start between two rooms that should simply cross over.
  if (theme && next) {
    requestAudioTheme({ sourceId: next, theme, slot: "ambient", label: loc.name, kind: "location" });
  }
  if (previous) releaseAudioTheme(previous);
  heldSourceId.value = next;
}

watch(() => props.location.id, () => syncAmbience(props.location), { immediate: true });
watch(() => ui.sessionRunning, () => syncAmbience(props.location));

onUnmounted(() => {
  if (heldSourceId.value) releaseAudioTheme(heldSourceId.value);
});
</script>
