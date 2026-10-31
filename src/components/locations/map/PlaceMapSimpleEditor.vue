<template>
  <!-- The full-screen editor of a place that is not a site (#1125, frame 04):
       Picture and Pins, nothing else. Both write as they are changed, so the
       bar has no Save; it just says so. -->
  <div class="flex h-dvh flex-col bg-background">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2">
      <AppButton
        :to="backTo"
        variant="ghost"
        fill="muted"
        size="sm"
        class="max-w-48 shrink-0"
        :icon="IconChevronLeft"
        :label="location.name"
        :aria-label="`Back to ${location.name}`"
      />
      <h1 class="min-w-0 flex-1 truncate text-heading-sm font-bold text-foreground">Edit map</h1>
      <SegmentedControl v-model="layer" :options="LAYER_OPTIONS" size="sm" />
      <p class="text-caption text-muted-foreground max-sm:hidden">Changes save as you make them.</p>
    </header>

    <main class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <div class="mx-auto flex max-w-3xl flex-col gap-3">
        <MapLayersPanel v-if="layer === 'picture'" :location="location" />
        <template v-else>
          <PlaceMapPinsEditor
            v-if="hasMap"
            :location="location"
            :locations="locations"
            @select="onSelect"
          />
          <p v-else class="rounded-md border border-dashed border-border px-4 py-8 text-center text-body text-muted-foreground">
            Pins sit on a picture. Add the Picture first, then come back to place them.
          </p>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import MapLayersPanel from "@/components/locations/map/MapLayersPanel.vue";
import PlaceMapPinsEditor from "@/components/locations/map/PlaceMapPinsEditor.vue";
import { IconChevronLeft, IconImage, IconPin } from "@/lib/icons";
import { buildMapStack } from "@/lib/locations/mapStack";
import { placeRoute, type MapEditorLayer } from "@/lib/locations/placeRoute";
import type { Location, LocationSummary } from "@/types/location.types";

const { location, startLayer } = defineProps<{
  location: Location;
  /** Every place in the campaign: pin candidates are descendants reached
   *  through vague containers, not only children. */
  locations: readonly LocationSummary[];
  /** Where the back link goes: the place's Map tab. */
  backTo: string;
  startLayer: MapEditorLayer;
}>();

const router = useRouter();

const LAYER_OPTIONS = [
  { value: "picture", label: "Picture", icon: IconImage },
  { value: "pins", label: "Pins", icon: IconPin },
] as const;

const layer = ref<"picture" | "pins">(startLayer === "pins" ? "pins" : "picture");

const hasMap = computed(() => buildMapStack(location).hasAnyLayer);

function onSelect(id: string): void {
  void router.push(placeRoute(id));
}
</script>
