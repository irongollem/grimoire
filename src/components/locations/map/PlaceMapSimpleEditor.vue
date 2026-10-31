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
        <div v-if="layer === 'picture'" class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <!-- The picture, fitted. Lining the grid up lays the amber grid over it, as in the site editor's Picture layer. -->
          <div class="relative h-[60vh] min-h-64 overflow-hidden rounded-md border border-border bg-muted/30">
            <MapGridLineUp
              v-if="liningUp && natural && draft && location.map_url"
              v-model="draft"
              :natural="natural"
              :box-mode="boxMode"
              :hint="`${Number(draft.cells_per_image_width.toFixed(1))} squares across. Drag the grid to line it up; arrow keys nudge it a pixel.`"
              @box-done="boxMode = false"
            >
              <img :src="location.map_url" alt="" draggable="false" class="absolute inset-0 size-full object-contain" />
            </MapGridLineUp>
            <img v-else-if="location.map_url" :src="location.map_url" :alt="`Map of ${location.name}`" class="size-full object-contain" />
            <p v-else class="flex size-full items-center justify-center px-4 text-center text-body text-muted-foreground">
              No picture yet. Upload a scan, a screenshot or a render, then pin what is on it.
            </p>
          </div>

          <aside class="flex flex-col gap-3 rounded-md border border-border bg-card p-3" aria-label="Picture">
            <h2 class="text-label-lg font-semibold text-foreground">{{ liningUp ? "Line up the grid" : "Picture" }}</h2>
            <template v-if="liningUp && natural && draft">
              <PictureGridFields v-model="draft" v-model:box-mode="boxMode" :natural="natural" />
              <div class="flex items-center gap-1.5">
                <AppButton variant="primary" size="sm" label="Done" @click="finishLineUp" />
                <AppButton variant="ghost" fill="muted" size="sm" label="Cancel" @click="cancelLineUp" />
              </div>
            </template>
            <MapPictureControls
              v-else
              :has-picture="!!location.map_url"
              :moving="picture.motion !== null"
              :battle-map="location.is_battle_map"
              :busy="pictureWrites.busy.value"
              @upload="pictureWrites.setPicture"
              @remove="pictureWrites.removePicture"
              @line-up="startLineUp"
              @update:battle-map="pictureWrites.setBattleMap"
            />
          </aside>
        </div>
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
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import MapGridLineUp from "@/components/cartographer/MapGridLineUp.vue";
import PictureGridFields from "@/components/cartographer/PictureGridFields.vue";
import MapPictureControls from "@/components/locations/map/MapPictureControls.vue";
import PlaceMapPinsEditor from "@/components/locations/map/PlaceMapPinsEditor.vue";
import { IconChevronLeft, IconImage, IconPin } from "@/lib/icons";
import { usePlacePicture } from "@/composables/locations/usePlacePicture";
import { DEFAULT_SQUARES_ACROSS, calibrationFor, type ImageSize } from "@/lib/mapBring/pictureGrid";
import { buildMapStack } from "@/lib/locations/mapStack";
import { placeRoute, type MapEditorLayer } from "@/lib/locations/placeRoute";
import type { GridCalibration, Location, LocationSummary } from "@/types/location.types";

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

const picture = computed(() => buildMapStack(location));
const hasMap = computed(() => picture.value.hasAnyLayer);

// ── The Picture: its writes, and lining its grid up ─────────────────────────
const pictureWrites = usePlacePicture(() => location);
const natural = ref<ImageSize | null>(null);
const liningUp = ref(false);
const draft = ref<GridCalibration | null>(null);
const boxMode = ref(false);

watch(
  () => location.map_url,
  (url) => {
    natural.value = null;
    cancelLineUp();
    if (!url) return;
    const img = new Image();
    img.onload = () => { natural.value = { width: img.naturalWidth, height: img.naturalHeight }; };
    img.src = url;
  },
  { immediate: true },
);

function startLineUp(): void {
  if (!natural.value) return;
  draft.value = location.grid_calibration ? { ...location.grid_calibration } : calibrationFor(natural.value, DEFAULT_SQUARES_ACROSS);
  boxMode.value = false;
  liningUp.value = true;
}
function cancelLineUp(): void {
  liningUp.value = false;
  draft.value = null;
  boxMode.value = false;
}
function finishLineUp(): void {
  if (draft.value) void pictureWrites.setCalibration(draft.value);
  cancelLineUp();
}

function onSelect(id: string): void {
  void router.push(placeRoute(id));
}
</script>
