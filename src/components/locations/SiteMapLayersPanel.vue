<template>
  <div class="flex flex-col gap-1.5 rounded-md border border-border bg-card/60 px-3 py-2">
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-1.5 text-label-lg font-semibold text-muted-foreground">
        <IconLayers class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />Layers
      </span>
      <!-- "What the players see" (#884, wave 4, S12) — the DM checks what a
           shared plan gives away before the session, without changing any
           data: the player's own composed view (fog opaque, structure as
           `get_player_visible_site_state` would actually return it). -->
      <AppButton
        variant="ghost"
        size="inline-xs"
        :icon="IconReveal"
        :label="previewOpen ? 'Hide player preview' : 'Preview as players'"
        :active="previewOpen"
        @click="previewOpen = !previewOpen"
      />
    </div>

    <div v-if="previewOpen" class="flex flex-col gap-2 rounded-md border border-border bg-background/60 p-2.5">
      <template v-if="!location.is_map_shared">
        <p class="text-caption italic text-muted-foreground">This site isn't shared with players yet — there is nothing for a preview to show.</p>
      </template>
      <template v-else>
        <label class="flex flex-col gap-1 text-caption font-semibold text-foreground">
          Audience
          <AppSelect v-model="previewAudienceId" aria-label="Preview audience">
            <option value="">Choose a shared character…</option>
            <option v-for="member in previewAudienceOptions" :key="member.id" :value="member.id">{{ member.name }}</option>
          </AppSelect>
        </label>
        <p v-if="!previewAudienceOptions.length" class="text-caption text-tone-caution">This site isn't shared with a party character yet.</p>
        <div v-else-if="!previewAudienceId" class="rounded-md border border-dashed border-border p-3 text-center text-caption text-muted-foreground">
          Choose an audience to load the player-safe plan.
        </div>
        <LoadingSpinner v-else-if="previewQuery.isLoading.value" class="mx-auto my-4" />
        <p v-else-if="previewQuery.error.value" role="alert" class="text-caption text-destructive">The player-safe plan could not be loaded.</p>
        <PlayerSitePlan v-else-if="previewQuery.data.value" :plan="previewQuery.data.value" :opaque="true" class="max-w-sm" />
      </template>
    </div>

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
              <AppButton variant="ghost" size="inline-xs" :label="reviewLabel" @click="emit('review-changes')" />
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
 * DM to. Mounted in the map area, Build-only, by `AtlasSiteMapMode`, never in Browse, since every action
 * here is an edit to the stack itself.
 *
 * Three rows, bottom-up: Picture (`map_url`), Drawing (`map_layer_url`, a
 * Cartographer bake), Plan (the traced spaces/ways/zones, `plan_size` only
 * when there is no image beneath them). See `lib/locations/mapStack.ts` for
 * the stack itself — this panel is the one place that reads AND writes it.
 *
 * The Drawing row's actions are all emitted rather than routed here (#884
 * S11: the Cartographer is mounted inline now, right below this panel, so
 * there is nothing left to route to). `open-drawing` — `Open` on an existing
 * drawing, `Start drawing` on an empty one — is answered by both current
 * callers with `useOpenSiteDrawing`, which sets the site's own drawing in
 * place rather than navigating away; see that composable. `review-changes`
 * — `Review N changes` — tells the host to open the embedded workbench's own
 * Publish modal already pointed at this site, replacing the old
 * `/cartographer/:id?publishTo=` round trip.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import GridCalibrationDialog from "@/components/locations/GridCalibrationDialog.vue";
import PlayerSitePlan from "@/components/player/PlayerSitePlan.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useImageUpload } from "@/composables/useImageUpload";
import { useParty } from "@/composables/party/useParty";
import {
  useUpdateLocation,
  useUpdateLocationGridCalibration,
  useUpdateLocationPicture,
} from "@/composables/locations/useLocations";
import { usePlayerVisibleSiteState } from "@/composables/locations/usePlayerVisibleSiteState";
import { IconGrid, IconImage, IconLayers, IconPencilLine, IconReveal } from "@/lib/icons";
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
    | "is_map_shared"
    | "player_visible_to"
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

const emit = defineEmits<{ "open-drawing": []; "review-changes": [] }>();

const stack = computed(() => buildMapStack(location));

// ── "Preview as players" (#884, wave 4, S12) — see the template comment
//    above. The query only fires once a preview is open AND an audience is
//    chosen (`usePlayerVisibleSiteState`'s `enabled` gate) — there is no
//    sense asking the RPC before either is true, and the DM is never
//    themselves a valid audience for it. ─────────────────────────────────
const previewOpen = ref(false);
const previewAudienceId = ref("");
const { data: party } = useParty();
const previewAudienceOptions = computed(() => (party.value ?? []).filter((member) => location.player_visible_to.includes(member.id)));
const previewMemberIdRef = computed(() => previewAudienceId.value || null);
const previewEnabled = computed(() => previewOpen.value && !!previewAudienceId.value);
const previewQuery = usePlayerVisibleSiteState(computed(() => location.id), previewMemberIdRef, previewEnabled);

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
