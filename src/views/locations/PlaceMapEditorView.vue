<template>
  <div v-if="loading || redirecting" class="flex h-dvh items-center justify-center bg-background">
    <LoadingSpinner />
  </div>

  <div v-else-if="!location" class="flex h-dvh items-center justify-center bg-background">
    <EmptyState title="Could not open this place" description="It may have been deleted, or belong to another campaign.">
      <template #action>
        <AppButton to="/locations" variant="outline" label="Back to the Atlas" />
      </template>
    </EmptyState>
  </div>

  <!-- Keyed by place: a level switch lands here with another id, and each
       place gets an editor of its own (its autosave remembers what it made). -->
  <SiteMapEditor
    v-else
    :key="location.id"
    :location="location"
    :index="index"
    :back-to="backTo"
    :start-layer="layer"
  />
</template>

<script setup lang="ts">
/**
 * A place's full-screen map editor (#1125, frame 07), at `/locations/:id/map`.
 * Like the Scriptorium's, it takes the whole viewport: the app's sidebar and
 * bars give way (`editorFocus`). A site, and a battle map of any type, get the
 * Cartographer workbench (it takes any place; a battle map's spaces may be
 * empty). Every other place edits on its Atlas Map tab (measure, grid, pins and
 * the image menu, 14 Nov 2026), so an old link to its editor lands there.
 *
 * Back always lands on the place's Map tab, however the editor was reached, so
 * the tab is selected on arrival rather than on the way out: a browser Back
 * from here returns to it too.
 */
import { computed, onBeforeUnmount, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import SiteMapEditor from "@/components/locations/map/SiteMapEditor.vue";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { placeRoute, startLayer } from "@/lib/locations/placeRoute";
import { isSiteType } from "@/lib/locations/tiers";
import { buildAtlasIndex } from "@/lib/locations/tree";
import { useAppUiStore } from "@/stores/ui/app";
import { useLocationsUiStore } from "@/stores/ui/locations";

const route = useRoute();
const router = useRouter();

const placeId = computed(() => {
  const p = route.params.id;
  return typeof p === "string" ? p : "";
});

const appUi = useAppUiStore();
appUi.editorFocus = true;
onBeforeUnmount(() => { appUi.editorFocus = false; });

// The Atlas shows the Map tab when it is reopened, whichever way out is taken.
useLocationsUiStore().locationsPaneMode = "map";

const backTo = computed(() => placeRoute(placeId.value));

const { data: location, isPending } = useLocation(placeId);
// The place's own campaign, not the active one: a site opened by link from another of the DM's campaigns
// would otherwise find none of its child spaces. A global place (no campaign) reads the active campaign.
const { data: allLocationsData, isPending: allPending } = useAllLocations(
  () => !placeId.value || !isPending.value,
  () => location.value?.campaign_id ?? null,
);
const allLocations = computed(() => allLocationsData.value ?? []);
const index = computed(() => buildAtlasIndex(allLocations.value));

const loading = computed(() => (!!placeId.value && isPending.value) || allPending.value);

const hasEditor = computed(() => !!location.value && (isSiteType(location.value.location_type) || location.value.is_battle_map));
const layer = computed(() => startLayer(route.query.layer));

// A place with no full-screen editor goes to the Map tab, where its tools are. Replace, not push: Back must not return here.
const redirecting = computed(() => !!location.value && !hasEditor.value);
watch(redirecting, (go) => {
  if (go) void router.replace(placeRoute(placeId.value));
}, { immediate: true });
</script>
