<template>
  <!-- Bring a map (#1125, canvas frame 06): the picture with the grid over it to line up, and on the right what the
       app needs to know. A Universal VTT file carries its own grid, so there is nothing to line up. -->
  <div v-if="file" class="flex h-dvh flex-col">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-3 py-2">
      <AppButton to="/cartographer/new" variant="ghost" fill="muted" size="sm" :icon="IconChevronLeft" label="New map" aria-label="Back to new map" />
      <AppInput v-model="name" tone="underline" size="body" class="min-w-0 flex-1 sm:max-w-md" aria-label="Map name" placeholder="Name this map" />
      <div class="ml-auto flex items-center gap-2">
        <AppButton variant="ghost" fill="muted" size="sm" label="Cancel" @click="cancel" />
        <AppButton variant="primary" size="sm" label="Add map" :loading="adding" :disabled="!canAdd" @click="add" />
      </div>
    </header>

    <main class="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[minmax(0,1fr)_22rem] lg:overflow-hidden">
      <!-- The map -->
      <div class="flex min-h-72 flex-col gap-2 lg:min-h-0">
        <div class="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
          <p v-if="vttError" class="flex size-full items-center justify-center px-6 text-center text-body text-destructive">{{ vttError }}</p>
          <MapGridLineUp
            v-else-if="previewUrl && natural && calibration"
            v-model="calibration"
            :natural="natural"
            :box-mode="boxMode"
            :locked="isVtt"
            :hint="hint"
            @box-done="boxMode = false"
          >
            <video
              v-if="motion === 'video'"
              ref="videoEl"
              :src="previewUrl"
              class="absolute inset-0 size-full object-contain"
              autoplay
              muted
              loop
              playsinline
              @play="playing = true"
              @pause="playing = false"
            />
            <img v-else :src="previewUrl" alt="The map to bring" draggable="false" class="absolute inset-0 size-full object-contain" />
          </MapGridLineUp>
          <!-- Measuring the file: the grid needs the picture's size, which only the decoder knows. The media sits
               unseen until it has told us. -->
          <template v-else-if="previewUrl && !vttError">
            <video v-if="motion === 'video'" ref="videoEl" :src="previewUrl" class="sr-only" muted playsinline @loadedmetadata="onVideoMeta" />
            <img v-else :src="previewUrl" alt="" class="sr-only" @load="onImageLoad" />
            <div class="flex size-full items-center justify-center"><BannerLoader class="h-8" /></div>
          </template>
        </div>

        <div v-if="motion === 'video' && natural" class="flex flex-wrap items-center gap-2">
          <AppButton
            variant="outline"
            size="sm"
            :icon="playing ? IconPause : IconPlay"
            :label="playing ? 'Pause' : 'Play'"
            @click="togglePlay"
          />
          <AppButton variant="outline" size="sm" label="Use this frame as the still" @click="takeStill" />
          <span v-if="stillAt !== null" class="text-caption text-muted-foreground">Still taken at {{ stillAt.toFixed(1) }} s</span>
        </div>
      </div>

      <!-- What the app needs to know -->
      <aside class="flex flex-col gap-5 lg:overflow-y-auto lg:pr-1" aria-label="About this map">
        <section class="flex flex-col gap-1">
          <h2 class="text-eyebrow font-semibold text-muted-foreground">The file</h2>
          <p class="break-words text-body font-semibold text-foreground">{{ file.name }}</p>
          <p class="text-caption text-muted-foreground">{{ fileLine }}</p>
          <p v-if="isMoving" class="text-caption text-muted-foreground">Plays on this device's screens. Players see the still.</p>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-eyebrow font-semibold text-muted-foreground">The grid</h2>
          <p v-if="isVtt && vtt" class="text-body text-foreground">
            {{ Number((natural ? natural.width / vtt.map.pixelsPerGrid : vtt.map.cols).toFixed(1)) }} squares across, read from the file.
            Nothing to line up.
          </p>
          <PictureGridFields
            v-else-if="natural && calibration"
            v-model="calibration"
            v-model:box-mode="boxMode"
            v-model:square-feet="squareFeet"
            :natural="natural"
          />
        </section>

        <section class="flex flex-col gap-2">
          <h2 class="text-eyebrow font-semibold text-muted-foreground">Where it lives</h2>
          <label class="flex items-start gap-2" :class="lockedTarget ? 'opacity-60' : 'cursor-pointer'">
            <input v-model="where" type="radio" value="new" class="mt-1 accent-primary" :disabled="lockedTarget" />
            <span class="flex flex-col">
              <span class="text-body font-semibold text-foreground">A new battlefield in the Atlas</span>
              <span class="text-caption text-muted-foreground">A place of its own, marked as a battle map.</span>
            </span>
          </label>
          <label class="flex items-start gap-2" :class="lockedTarget ? '' : 'cursor-pointer'">
            <input v-model="where" type="radio" value="existing" class="mt-1 accent-primary" :disabled="lockedTarget" />
            <span class="flex flex-col">
              <span class="text-body font-semibold text-foreground">The picture of a place I pick</span>
              <span class="text-caption text-muted-foreground">It replaces that place's current picture.</span>
            </span>
          </label>
          <div v-if="where === 'existing'" class="pl-6">
            <p v-if="lockedTarget" class="text-body text-foreground">{{ pickedName }}</p>
            <EntityCombobox v-else v-model="pickedId" :options="placeOptions" placeholder="Search the Atlas…" />
            <p v-if="vttBlockedByDrawing" class="mt-1 text-caption text-ink-caution">
              This place already has a drawing, and a Universal VTT file brings its own. Pick another place or a new battlefield.
            </p>
          </div>
        </section>

        <p class="rounded-md border border-border bg-muted/40 px-3 py-2 text-caption text-muted-foreground">
          A Universal VTT file instead: it carries its grid, walls, doors and lights; they arrive as a drawing over the
          picture, ready to block sight and open in play. Nothing to line up.
        </p>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import MapGridLineUp from "@/components/cartographer/MapGridLineUp.vue";
import PictureGridFields from "@/components/cartographer/PictureGridFields.vue";
import { useLibraryTilePacks } from "@/composables/cartographer/useLibraryTilePacks";
import { useBringMap, type BringInput } from "@/composables/locations/useBringMap";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import { IconChevronLeft, IconPause, IconPlay } from "@/lib/icons";
import { mapEditorRoute, placeRoute } from "@/lib/locations/placeRoute";
import { isSiteType } from "@/lib/locations/tiers";
import { describeFile, isUniversalVttName, nameFromFile } from "@/lib/mapImport/bringFile";
import {
  calibrationFor,
  fiveFootCalibration,
  initialGrid,
  gridSizeText,
  type GridSource,
  type ImageSize,
  type SquareFeet,
} from "@/lib/mapImport/pictureGrid";
import { detectMotion, type MapMotion } from "@/lib/mapImport/motionDetect";
import { isUvttError, parseUniversalVtt, type UniversalVttMap } from "@/lib/mapImport/universalVtt";
import { useMapImportStore } from "@/stores/mapImport";
import { useAppUiStore } from "@/stores/ui/app";
import { useLocationsUiStore } from "@/stores/ui/locations";
import type { GridCalibration } from "@/types/location.types";

const router = useRouter();
const toast = useToast();
const store = useMapImportStore();

const appUi = useAppUiStore();
appUi.editorFocus = true;
onBeforeUnmount(() => { appUi.editorFocus = false; });

// The file is held in memory only. Without it (a reload) there is nothing to bring: back to choosing one.
const file = store.file;
if (!file) void router.replace("/cartographer/new");
const isVtt = file ? isUniversalVttName(file.name) : false;

const name = ref(file ? nameFromFile(file.name) : "");
const motion = ref<MapMotion | null>(null);
const previewUrl = ref<string | null>(null);
const natural = ref<ImageSize | null>(null);
const calibration = ref<GridCalibration | null>(null);
const gridSource = ref<GridSource>("default");
const squareFeet = ref<SquareFeet>(5);
const boxMode = ref(false);
const vtt = ref<{ map: UniversalVttMap } | null>(null);
const vttError = ref<string | null>(null);
const isMoving = computed(() => motion.value === "video" || motion.value === "animated");

// ── Reading the file ────────────────────────────────────────────────────────
onMounted(async () => {
  if (!file) return;
  try {
    if (isVtt) {
      const parsed = parseUniversalVtt(JSON.parse(await file.text()));
      if (isUvttError(parsed)) {
        vttError.value = parsed.error;
        return;
      }
      vtt.value = { map: parsed };
      previewUrl.value = URL.createObjectURL(parsed.image);
    } else {
      motion.value = await detectMotion(file);
      previewUrl.value = URL.createObjectURL(file);
    }
  } catch {
    vttError.value = isVtt ? "This is not a Universal VTT file." : "This file could not be read.";
  }
});
onBeforeUnmount(() => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); });

/** The picture's size is known: the grid can be laid on it. */
function onMeasured(size: ImageSize): void {
  natural.value = size;
  if (file === null) return;
  if (vtt.value) {
    // The file states its grid: pixels per square, from the origin.
    calibration.value = calibrationFor(size, size.width / vtt.value.map.pixelsPerGrid);
    gridSource.value = "name";
    return;
  }
  const initial = initialGrid(file.name, size);
  calibration.value = initial.calibration;
  gridSource.value = initial.source;
}
const videoEl = ref<HTMLVideoElement | null>(null);
function onImageLoad(ev: Event): void {
  const img = ev.target as HTMLImageElement;
  onMeasured({ width: img.naturalWidth, height: img.naturalHeight });
}
function onVideoMeta(): void {
  const v = videoEl.value;
  if (v) onMeasured({ width: v.videoWidth, height: v.videoHeight });
}

// ── Video: play, pause, and the frame that becomes the still ────────────────
const playing = ref(true);
const stillAt = ref<number | null>(null);
function togglePlay(): void {
  const v = videoEl.value;
  if (!v) return;
  if (v.paused) void v.play();
  else v.pause();
}
function takeStill(): void {
  if (videoEl.value) stillAt.value = videoEl.value.currentTime;
}

// ── Words ───────────────────────────────────────────────────────────────────
const fileLine = computed(() => {
  if (!file) return "";
  const kind = isVtt ? "vtt" : motion.value ?? "still";
  return describeFile(file, kind, natural.value);
});
const hint = computed(() => {
  const cal = calibration.value;
  const size = natural.value;
  if (!cal || !size) return "";
  const grid = gridSizeText(cal, size);
  if (isVtt) return `${grid}, read from the file.`;
  const origin = gridSource.value === "name" ? "read from the file name" : "a starting guess";
  return `${grid}, ${origin}. Drag the grid to line it up; arrow keys nudge it a pixel.`;
});

// ── Where it lives ──────────────────────────────────────────────────────────
const lockedTarget = store.targetPlaceId !== null;
const where = ref<"new" | "existing">(lockedTarget ? "existing" : "new");
const placeId = ref<string | null>(store.targetPlaceId);
// EntityCombobox speaks in strings; an empty one is "nothing picked".
const pickedId = computed<string>({
  get: () => placeId.value ?? "",
  set: (id) => { placeId.value = id === "" ? null : id; },
});
const { data: locations } = useAllLocations();
const placeOptions = computed(() => (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })));
const pickedPlace = computed(() => (locations.value ?? []).find((l) => l.id === placeId.value));
const pickedName = computed(() => pickedPlace.value?.name ?? "");
const vttBlockedByDrawing = computed(() => !!vtt.value && where.value === "existing" && !!pickedPlace.value?.source_map_id);

// ── Adding it ───────────────────────────────────────────────────────────────
const { publishedPacks } = useLibraryTilePacks();
const { addMap } = useBringMap();
const adding = ref(false);

const canAdd = computed(() => {
  if (adding.value || !natural.value || !calibration.value || !name.value.trim() || vttError.value) return false;
  if (where.value === "existing" && placeId.value === null) return false;
  return !vttBlockedByDrawing.value;
});

async function add(): Promise<void> {
  const size = natural.value;
  const cal = calibration.value;
  const target = where.value === "existing" ? placeId.value : null;
  if (!file || !size || !cal || (where.value === "existing" && target === null)) return;
  const input: BringInput = {
    file,
    name: name.value.trim(),
    // The battle map counts 5 ft cells: a map drawn in 10 ft squares is written with twice the squares across.
    calibration: fiveFootCalibration(cal, size, squareFeet.value),
    target: target === null ? { kind: "new" } : { kind: "existing", id: target },
    // No still chosen yet: the first frame, which storePicture defaults to.
    ...(stillAt.value === null ? {} : { posterAt: stillAt.value }),
    // The imported walls are invisible and need no art; the first published set only opens as the Drawing's default.
    ...(vtt.value ? { vtt: { map: vtt.value.map, natural: size, defaultPackId: publishedPacks.value[0]?.pack_id ?? null } } : {}),
  };
  adding.value = true;
  try {
    const { placeId: placed } = await addMap(input);
    store.clear();
    // A created thing opens (like a new Scriptorium book): the editor saves itself, so there is no list to confirm on.
    // A new place is a battle map and a site has the Cartographer; any other existing place has its tools on the Map tab.
    const place = target === null ? undefined : pickedPlace.value;
    if (place && !isSiteType(place.location_type) && !place.is_battle_map) {
      useLocationsUiStore().locationsPaneMode = "map";
      await router.push(placeRoute(placed));
    } else {
      await router.push(mapEditorRoute(placed, "base"));
    }
  } catch (e) {
    toast.error(toast.fromError(e));
  } finally {
    adding.value = false;
  }
}

function cancel(): void {
  const back = store.targetPlaceId ? placeRoute(store.targetPlaceId) : "/cartographer/new";
  store.clear();
  void router.push(back);
}
</script>
