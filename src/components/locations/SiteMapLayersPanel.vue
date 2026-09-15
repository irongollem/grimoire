<template>
  <div class="flex flex-col gap-1.5 rounded-md border border-border bg-card/60 px-3 py-2">
    <span class="flex items-center gap-1.5 text-label-lg font-semibold text-muted-foreground">
      <IconLayers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Layers
    </span>

    <div class="flex flex-col divide-y divide-border/40">
      <!-- Picture — locations.map_url + grid_calibration. Bottom of the stack. -->
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 first:pt-0">
        <span class="flex w-20 shrink-0 items-center gap-1.5 text-label-lg font-semibold text-foreground">
          <IconImage class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />Picture
        </span>

        <template v-if="stack.picture">
          <span class="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            <!--
              Deliberately not the file name: an upload is stored under a
              generated id, so naming it would print a uuid at the DM — the
              design sheet's "ashmouth-scan.webp" is a name this pipeline
              never has. What is actionable is whether the grid is set, so
              that is what the row says.
            -->
            <template v-if="stack.picture.calibration">
              Calibrated {{ Math.round(stack.picture.calibration.cells_per_image_width) }} cells wide
            </template>
            <template v-else>Not calibrated — rooms cannot be traced until it is</template>
          </span>
          <div class="flex shrink-0 items-center gap-1.5">
            <AppButton
              variant="ghost"
              size="inline-xs"
              :disabled="isUploadingPicture"
              :label="isUploadingPicture ? 'Uploading…' : 'Replace'"
              @click="pictureFileInput?.click()"
            />
            <span class="text-2xs text-muted-foreground/40">·</span>
            <AppButton
              variant="ghost"
              size="inline-xs"
              :label="stack.picture.calibration ? 'Re-calibrate' : 'Calibrate'"
              @click="calibrationOpen = true"
            />
            <span class="text-2xs text-muted-foreground/40">·</span>
            <AppButton variant="link" tone="danger" size="inline-xs" label="Remove" @click="onRemovePicture" />
          </div>
        </template>
        <template v-else>
          <span class="min-w-0 flex-1 text-caption italic text-muted-foreground/60">(empty)</span>
          <AppButton
            variant="outline"
            size="xs"
            :loading="isUploadingPicture"
            label="Upload a picture"
            @click="pictureFileInput?.click()"
          />
        </template>

        <input
          ref="pictureFileInput"
          type="file"
          accept="image/*"
          class="sr-only"
          @change="onPictureFileChange"
        />
      </div>

      <!-- Drawing — a transparent bake of the Cartographer drawing at source_map_id. -->
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
        <span class="flex w-20 shrink-0 items-center gap-1.5 text-label-lg font-semibold text-foreground">
          <IconPencilLine class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />Drawing
        </span>

        <template v-if="location.source_map_id">
          <span
            class="min-w-0 flex-1 truncate text-caption"
            :class="staleness ? 'text-ink-caution' : 'text-muted-foreground'"
          >
            <template v-if="map">
              "{{ map.name }}" · rev {{ map.rev }}
              <template v-if="staleness"> · plan at rev {{ location.map_published_rev }}</template>
            </template>
            <template v-else>Loading…</template>
          </span>
          <div class="flex shrink-0 items-center gap-1.5">
            <AppButton variant="ghost" size="inline-xs" label="Open" @click="emit('open-drawing')" />
            <template v-if="staleness">
              <span class="text-2xs text-muted-foreground/40">·</span>
              <AppButton variant="ghost" size="inline-xs" :label="reviewLabel" :to="reviewUrl" />
            </template>
          </div>
        </template>
        <template v-else>
          <span class="min-w-0 flex-1 text-caption italic text-muted-foreground/60">(empty)</span>
          <AppButton variant="outline" size="xs" label="Start drawing" @click="emit('open-drawing')" />
        </template>
      </div>

      <!-- Plan — the traced spaces/ways/zones, on whatever canvas sits below
           them. `plan_size` (a blank grid) only ever applies when Picture and
           Drawing are BOTH absent — see `buildMapStack`, which nulls `blank`
           the moment either image layer exists — so this row's own empty
           state and its "Start a blank grid" action only appear when there is
           truly no canvas of any kind. Once a canvas exists (image or blank
           grid) tracing happens directly on the map rendered below this
           panel, so a populated row has nothing further to "open" — a
           deliberate omission, not an oversight. -->
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 last:pb-0">
        <span class="flex w-20 shrink-0 items-center gap-1.5 text-label-lg font-semibold text-foreground">
          <IconGrid class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />Plan
        </span>

        <template v-if="stack.hasAnyLayer">
          <span class="min-w-0 flex-1 truncate text-caption text-muted-foreground">
            {{ counts.spaces }} space{{ counts.spaces === 1 ? "" : "s" }}
            · {{ counts.ways }} way{{ counts.ways === 1 ? "" : "s" }} out
            · {{ counts.zones }} zone{{ counts.zones === 1 ? "" : "s" }}
          </span>
        </template>
        <template v-else>
          <span class="min-w-0 flex-1 text-caption italic text-muted-foreground/60">(empty, and no grid above)</span>
          <div class="flex shrink-0 items-center gap-1.5">
            <AppInput
              v-model.number="blankCols"
              type="number"
              min="1"
              max="400"
              step="1"
              tone="filled"
              size="xs"
              :block="false"
              class="w-12"
              aria-label="Grid columns"
            />
            <span class="text-caption text-muted-foreground">×</span>
            <AppInput
              v-model.number="blankRows"
              type="number"
              min="1"
              max="400"
              step="1"
              tone="filled"
              size="xs"
              :block="false"
              class="w-12"
              aria-label="Grid rows"
            />
            <AppButton
              variant="outline"
              size="xs"
              :loading="startingBlank"
              :disabled="!blankSizeValid"
              label="Start a blank grid"
              @click="onStartBlankGrid"
            />
          </div>
        </template>
      </div>
    </div>

    <GridCalibrationDialog
      :open="calibrationOpen"
      :map-url="location.map_url"
      :existing="location.grid_calibration"
      @cancel="calibrationOpen = false"
      @save="onCalibrationSave"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The Layers panel (#884, decision 4) — where a DM chooses what a site's map
 * is made of. Replaces the one-line "map lives in Build mode" pointer
 * `LocationEditor` shows a site: this is the surface that pointer sends the
 * DM to. Mounted in the map area, Build-only, by `AtlasSiteMapMode` and by
 * `LocationSheet`'s own map section — never in Browse, since every action
 * here is an edit to the stack itself.
 *
 * Three rows, bottom-up: Picture (`map_url`), Drawing (`map_layer_url`, a
 * Cartographer bake), Plan (the traced spaces/ways/zones, `plan_size` only
 * when there is no image beneath them). See `lib/locations/mapStack.ts` for
 * the stack itself — this panel is the one place that reads AND writes it.
 *
 * The Drawing row's primary action (`Open` on an existing drawing, `Start
 * drawing` on an empty one) is emitted rather than routed here: a later story
 * mounts the Cartographer inline, and only the caller will know where. Both
 * current callers answer it with `useOpenSiteDrawing` — see that composable
 * for the open-vs-create branch. `Review N changes`, by contrast, is a fully
 * determined URL the moment a drawing exists (`/cartographer/:id?publishTo=`)
 * — nothing for the caller to decide — so it routes directly, here.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import GridCalibrationDialog from "@/components/locations/GridCalibrationDialog.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import {
  useUpdateLocation,
  useUpdateLocationGridCalibration,
  useUpdateLocationPicture,
} from "@/composables/locations/useLocations";
import { IconGrid, IconImage, IconLayers, IconPencilLine } from "@/lib/icons";
import { buildMapStack } from "@/lib/locations/mapStack";
import type { PublishStaleness } from "@/lib/locations/siteReadiness";
import type { DungeonMap } from "@/types/dungeonMap.types";
import type { GridCalibration, Location } from "@/types/location.types";

const { location, map, staleness, counts } = defineProps<{
  location: Pick<
    Location,
    | "id"
    | "name"
    | "map_url"
    | "grid_calibration"
    | "map_layer_url"
    | "map_layer_calibration"
    | "plan_size"
    | "source_map_id"
    | "map_published_rev"
  >;
  /** The Cartographer drawing named by `location.source_map_id`. `null` while
   *  it loads or when there is none; `undefined` is not a state this panel
   *  distinguishes from `null` — both render "Loading…" until it settles,
   *  since a genuinely absent map is instead reflected by `source_map_id`
   *  being null, which never reaches this branch at all. */
  map: Pick<DungeonMap, "name" | "rev"> | null | undefined;
  /** Null when the last publish is current, or there is no drawing at all. */
  staleness: PublishStaleness | null;
  /** The same tally `useSiteStructure().layerCounts` gives the layer bar —
   *  shared rather than re-derived, so the two never disagree. */
  counts: { spaces: number; ways: number; zones: number };
}>();

const emit = defineEmits<{ "open-drawing": [] }>();

const stack = computed(() => buildMapStack(location));

// ── Picture ───────────────────────────────────────────────────────────────
const pictureFileInput = ref<HTMLInputElement | null>(null);
const { isUploading: isUploadingPicture, upload: uploadPictureFile, remove: removePictureFile } =
  useImageUpload("location-images");
const updatePicture = useUpdateLocationPicture();
const updateLocation = useUpdateLocation();
const { confirm } = useConfirm();

async function onPictureFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = "";
  if (!file) return;
  const oldUrl = location.map_url;
  const url = await uploadPictureFile(file);
  if (url) {
    await updatePicture.mutateAsync({ id: location.id, mapUrl: url });
    if (oldUrl) await removePictureFile(oldUrl);
  }
}

/**
 * Removing the picture always clears `grid_calibration` with it, whether or
 * not a Drawing remains underneath. The calibration is pixel coordinates on
 * THIS image specifically (`mapStack`'s Picture layer reads it as
 * `loc.grid_calibration` directly) — it has no meaning once `map_url` is
 * gone, and a Drawing carries its own independent `map_layer_calibration`
 * rather than inheriting this one. Leaving it behind is exactly the silently
 * orphaned calibration this story was asked not to create.
 */
async function onRemovePicture() {
  if (!(await confirm(`Remove this site's picture? Its calibration goes with it.`, { confirmLabel: "Remove" }))) {
    return;
  }
  const oldUrl = location.map_url;
  await updateLocation.mutateAsync({
    id: location.id,
    update: { map_url: null, grid_calibration: null },
  });
  if (oldUrl) await removePictureFile(oldUrl);
}

// ── Calibration dialog — shared by "Calibrate" and "Re-calibrate". ─────────
const calibrationOpen = ref(false);
const updateCalibration = useUpdateLocationGridCalibration();
async function onCalibrationSave(calibration: GridCalibration) {
  await updateCalibration.mutateAsync({ id: location.id, calibration });
  calibrationOpen.value = false;
}

// ── Drawing ───────────────────────────────────────────────────────────────
const reviewUrl = computed(() => `/cartographer/${location.source_map_id}?publishTo=${location.id}`);
const reviewLabel = computed(() => {
  if (!staleness) return "";
  const n = staleness.behind;
  return `Review ${n} change${n === 1 ? "" : "s"}`;
});

// ── Plan (blank grid) ────────────────────────────────────────────────────
// Its own `useUpdateLocation` instance, deliberately not shared with the
// Picture row's Remove above: sharing one mutation's `isPending` across two
// unrelated writes would flash this row's button into a loading state while
// the OTHER row's write was in flight — both can be visible and clickable at
// once (a populated Picture row alongside an empty Plan row).
const updateBlankGrid = useUpdateLocation();
const blankCols = ref<number | null>(12);
const blankRows = ref<number | null>(10);
const blankSizeValid = computed(
  () =>
    Number.isInteger(blankCols.value) &&
    blankCols.value !== null &&
    blankCols.value >= 1 &&
    blankCols.value <= 400 &&
    Number.isInteger(blankRows.value) &&
    blankRows.value !== null &&
    blankRows.value >= 1 &&
    blankRows.value <= 400,
);
const startingBlank = computed(() => updateBlankGrid.isPending.value);

async function onStartBlankGrid() {
  if (!blankSizeValid.value || blankCols.value === null || blankRows.value === null) return;
  await updateBlankGrid.mutateAsync({
    id: location.id,
    update: { plan_size: { cols: blankCols.value, rows: blankRows.value } },
  });
}
</script>
