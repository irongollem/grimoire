<template>
  <div v-if="loading" class="flex h-dvh items-center justify-center bg-background">
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
    v-else-if="isSite"
    :key="location.id"
    :location="location"
    :index="index"
    :back-to="backTo"
    :start-layer="layer"
  />
  <PlaceMapSimpleEditor
    v-else
    :key="location.id"
    :location="location"
    :locations="allLocations"
    :back-to="backTo"
    :start-layer="layer"
  />
</template>

<script setup lang="ts">
/**
 * A place's full-screen map editor (#1125, frame 07), at `/locations/:id/map`.
 * Like the Scriptorium's, it takes the whole viewport: the app's sidebar and
 * bars give way (`editorFocus`). A site gets the Cartographer workbench with
 * its Plan; every other place gets Picture and Pins.
 *
 * Back always lands on the place's Map tab, however the editor was reached, so
 * the tab is selected on arrival rather than on the way out: a browser Back
 * from here returns to it too.
 */
import { computed, onBeforeUnmount } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import PlaceMapSimpleEditor from "@/components/locations/map/PlaceMapSimpleEditor.vue";
import SiteMapEditor from "@/components/locations/map/SiteMapEditor.vue";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { placeRoute, startLayer } from "@/lib/locations/placeRoute";
import { isSiteType } from "@/lib/locations/tiers";
import { buildAtlasIndex } from "@/lib/locations/tree";
import { useAppUiStore } from "@/stores/ui/app";
import { useLocationsUiStore } from "@/stores/ui/locations";

const route = useRoute();

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
const { data: allLocationsData, isPending: allPending } = useAllLocations();
const allLocations = computed(() => allLocationsData.value ?? []);
const index = computed(() => buildAtlasIndex(allLocations.value));

const loading = computed(() => (!!placeId.value && isPending.value) || allPending.value);

const isSite = computed(() => !!location.value && isSiteType(location.value.location_type));
const layer = computed(() => startLayer(route.query.layer, isSite.value));
</script>
