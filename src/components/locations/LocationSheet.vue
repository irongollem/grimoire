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
      <button
        type="button"
        :disabled="isDeleting"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        @click="onDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />
        Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />
        Edit
      </button>
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
          <h1 class="text-title font-bold text-foreground leading-tight">{{ location.name }}</h1>
          <p v-if="location.location_type" class="text-body text-muted-foreground italic">
            {{ LOCATION_TYPE_LABELS[location.location_type] }}
          </p>
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

    <!-- Map -->
    <section v-if="location.map_url" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Map</h2>
      <LocationMap
        :map-url="location.map_url"
        :pins="location.map_pins ?? []"
        :children="mapPinnableChildren"
        mode="view"
        :show-hidden-pins="true"
        @pin-click="onPinClick"
      />
    </section>

    <!-- Sub-locations — read-only list linking into each child. -->
    <section v-if="children?.length" class="flex flex-col gap-2">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Sub-locations
        <span class="font-fell font-normal text-muted-foreground">({{ children.length }})</span>
      </h2>
      <div class="flex flex-wrap gap-2">
        <RouterLink
          v-for="child in children"
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
import { IconDelete, IconEdit } from '@/lib/icons';
import { useConfirm } from "@/composables/useConfirm";
import { requestAudioTheme, releaseAudioTheme } from "@/lib/audio/audioTriggers";
import {
  useLocations,
  useAllLocations,
  useDeleteLocation,
  getPinnableDescendants,
} from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import { visibleTags } from "@/lib/locations/tags";
import type { Location } from "@/types/location.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationDetailSections from "@/components/locations/LocationDetailSections.vue";
import LocationRevealControl from "@/components/locations/LocationRevealControl.vue";

const props = defineProps<{ location: Location }>();
const route   = useRoute();
const router  = useRouter();
const { confirm } = useConfirm();

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
function requestAmbience(loc: Location): void {
  if (!loc.audio_theme) return;
  requestAudioTheme({
    sourceId: `location:${loc.id}`,
    theme: loc.audio_theme,
    slot: "ambient",
    label: loc.name,
    kind: "location",
  });
}

watch(
  () => props.location.id,
  (_id, previousId) => {
    // Request first, release second, and the order is load-bearing. The new
    // location takes ownership of the ambient slot synchronously, so the
    // release that follows is recognised as stale and ignored. Releasing first
    // would instead hand the slot back to whatever preceded the old location
    // and then immediately take it again — an audible stop-start between two
    // rooms that should simply cross over.
    requestAmbience(props.location);
    if (previousId) releaseAudioTheme(`location:${previousId}`);
  },
  { immediate: true },
);

onUnmounted(() => releaseAudioTheme(`location:${props.location.id}`));
</script>
