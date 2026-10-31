<template>
  <div class="relative h-dvh p-2">
    <!-- Keyed by place by the view, so a level switch starts a fresh editor
         (its autosave remembers the map it created, which must not follow the
         DM to another floor). -->
    <MapWorkbench
      ref="workbenchRef"
      :map="seed"
      :view-mode="false"
      :site="location"
      :spaces="siteSpaces"
      :save-state="saveState"
      :menu-actions="menuActions"
      :review-count="siteStaleness?.behind"
      :start-layer="requestedLayer"
      :show-ready="true"
      :default-name="location.name"
      :picture-busy="picture.busy.value"
      @update:dirty="autosave.onDirtyChange"
      @update:edit-revision="autosave.onEditRevision"
      @menu-action="onMenuAction"
      @ready="openReady"
      @picture-upload="picture.setPicture"
      @picture-remove="picture.removePicture"
      @update:picture-calibration="picture.setCalibration"
      @update:is-battle-map="picture.setBattleMap"
    >
      <template #bar-start="{ mapName, setName }">
        <AppButton
          :to="backTo"
          variant="ghost"
          fill="muted"
          size="sm"
          class="max-w-40 shrink-0"
          :icon="IconChevronLeft"
          :label="location.name"
          :aria-label="`Back to ${location.name}`"
        />
        <AppInput
          :model-value="mapName"
          tone="underline"
          size="body"
          class="w-24 shrink-0 sm:w-48"
          aria-label="Map name"
          :placeholder="location.name"
          @update:model-value="setName"
        />
        <!-- The levels ride in the bar: without them a DM drawing one floor
             could not see or reach the others. -->
        <SiteLevelPicker
          :levels="levelList"
          :active-id="location.id"
          :adding="isAddingLevel"
          @select="onLevelSelect"
          @add="onAddLevel"
        />
      </template>
    </MapWorkbench>

    <PaywallModal v-model="showLevelPaywall" resource="locations" />

    <ReadyCheckSheet
      v-model:open="readyOpen"
      v-model:darkness="readyDarkness"
      :rows="readyRows"
      :map-name="readyMapName"
      :site-id="location.id"
      :site-name="location.name"
      :room-ids="siteSpaces.map((s) => s.id)"
      :first-room-name="siteSpaces[0]?.name ?? null"
      @fix="onReadyFix"
    />

    <CartographerPublishModal
      v-model="mapPublish.open.value"
      v-model:target-site-id="mapPublish.targetSiteId.value"
      :site-context="mapPublish.siteContext.value"
      :stair-targets="mapPublish.stairTargets.value"
      :review="mapPublish.review.value"
      @pick-stair-target="(cellKey, id) => (mapPublish.stairTargets.value = { ...mapPublish.stairTargets.value, [cellKey]: id })"
      @publish="mapPublish.publish()"
    />

    <!-- Style with AI (#884 decision 1): the render bubbles down to this
         site's Picture; the target is fixed to this site. -->
    <CartographerAiStyleModal
      v-model:atlasLocationId="styleAtlasLocationId"
      :show-picker="showStylePicker && campaignAiEnabled"
      :show-result="showStyleResult"
      :presets="CARTOGRAPHER_STYLE_PRESETS"
      :selected-preset-id="selectedPresetId"
      :prompt-suffix="stylePromptSuffix"
      :generating="styleGenerating"
      :error="styleError"
      :result-url="styleResultUrl"
      :location-options="NO_LOCATION_OPTIONS"
      :fixed-target-label="styleFixedTargetLabel"
      :atlas-target-has-map="styleAtlasTargetHasMap"
      :atlas-error="styleAtlasError"
      :atlas-saving="styleAtlasSaving"
      :credits="styleCost"
      :byok="styleByok"
      @close-picker="showStylePicker = false"
      @close-result="showStyleResult = false"
      @generate="onGenerateStyle"
      @retry="onRetryStyle"
      @back-to-picker="showStyleResult = false; showStylePicker = true"
      @download-styled="onDownloadStyled"
      @save-to-atlas="onSaveStyledToAtlas"
      @update:selected-preset-id="selectedPresetId = $event"
      @update:prompt-suffix="stylePromptSuffix = $event"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * A site's full-screen map editor (#1125, frame 07): the Cartographer
 * workbench with this site's Plan palette, saving the Drawing as it is edited.
 * It replaces the workbench that used to sit inside the Atlas's Build mode
 * (#884 S11). The route view around it (`PlaceMapEditorView`) owns the screen,
 * the back target and the starting layer; this owns everything that needs the
 * site: the Drawing's autosave, the level switch, and the Map menu's
 * publish / style / download / delete.
 */
import { computed, onBeforeUnmount, ref } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import CartographerAiStyleModal from "@/components/cartographer/CartographerAiStyleModal.vue";
import CartographerPublishModal from "@/components/cartographer/CartographerPublishModal.vue";
import MapWorkbench from "@/components/cartographer/MapWorkbench.vue";
import ReadyCheckSheet from "@/components/locations/map/ReadyCheckSheet.vue";
import SiteLevelPicker from "@/components/locations/site/SiteLevelPicker.vue";
import { bakeMapAsPng } from "@/cartographer/bake";
import { CARTOGRAPHER_STYLE_PRESETS } from "@/cartographer/stylePresets";
import type { MapMenuAction } from "@/cartographer/tools";
import { useDeleteDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useMapExport } from "@/composables/cartographer/useMapExport";
import { useMapPublish } from "@/composables/cartographer/useMapPublish";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useAddSiteLevel } from "@/composables/locations/useAddSiteLevel";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { usePlacePicture } from "@/composables/locations/usePlacePicture";
import { useSeededMap } from "@/composables/locations/useSeededMap";
import { useSiteDrawingEditor } from "@/composables/locations/useSiteDrawingEditor";
import { useSiteMapExtras, useSiteStructure } from "@/composables/locations/useSiteStructure";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconChevronLeft } from "@/lib/icons";
import { downloadBlob } from "@/lib/downloadBlob";
import { exportDrawingAsVtt } from "@/lib/mapImport/exportDrawing";
import { levelsOf } from "@/lib/locations/levels";
import { buildMapStack } from "@/lib/locations/mapStack";
import { mapEditorRoute, type MapEditorLayer } from "@/lib/locations/placeRoute";
import { playReadiness, type ReadyFixAction } from "@/lib/locations/playReadiness";
import { bindableSpaces } from "@/lib/locations/tiers";
import { childrenOf, type AtlasIndex } from "@/lib/locations/tree";
import type { DarknessLevel } from "@/types/dungeonMap.types";
import { useCampaignStore } from "@/stores/campaign";
import type { Location, LocationSummary } from "@/types/location.types";

/** `CartographerAiStyleModal`'s `locationOptions` prop is unused whenever
 *  `fixedTargetLabel` is set (as it always is here). */
const NO_LOCATION_OPTIONS: { id: string; name: string }[] = [];

const { location, index, backTo, startLayer } = defineProps<{
  location: Location;
  index: AtlasIndex;
  /** Where the back link goes: the place's Map tab. */
  backTo: string;
  startLayer: MapEditorLayer;
}>();

const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();
const campaignStore = useCampaignStore();
const campaignAiEnabled = computed(() => campaignStore.isAiEnabled);

const siteSpaces = computed(() => bindableSpaces(childrenOf(index, location.id)));
const mapStack = computed(() => buildMapStack(location));

// ── The Drawing and its autosave ────────────────────────────────────────────
const locationRef = computed(() => location);
const structure = useSiteStructure(locationRef);
const { staleness: siteStaleness, sourceMap: siteSourceMapQuery } = useSiteMapExtras(locationRef, structure);
const siteSourceMap = computed(() => siteSourceMapQuery.data.value);

const autosave = useSiteDrawingEditor(locationRef, siteSourceMap);
const workbenchRef = autosave.workbenchRef;
// The workbench starts from the Drawing once and then owns it (see
// `useSeededMap`); what the autosave writes must not be read back over it.
const seed = useSeededMap({
  source: () => siteSourceMap.value,
  scope: () => location.id,
  skipId: () => autosave.createdMapId.value,
});

const saveState = computed(() => (autosave.saving.value ? "Saving…" : autosave.dirty.value ? "Unsaved changes" : "Saved"));

// Leaving saves what is pending first, and a toast says so if that fails.
onBeforeUnmount(() => { void autosave.flush(); });
onBeforeRouteLeave(async () => { await autosave.flush(); });

// ── Picture layer ───────────────────────────────────────────────────────────
// Every write the Picture palette asks for. The workbench only draws it.
const picture = usePlacePicture(() => location);

/** The layer named in the address, or none: the workbench then opens where the site's map needs work (a picture with
 *  no grid opens on the Picture), which the route's own default of the Drawing cannot know. */
const route = useRoute();
const requestedLayer = computed(() => {
  if (route.query.layer === undefined) return undefined;
  return startLayer === "drawing" || startLayer === "plan" || startLayer === "picture" ? startLayer : undefined;
});

// ── Ready for the table (frame 08) ──────────────────────────────────────────
const readyOpen = ref(false);
const readyMapName = ref(location.name);
function openReady(): void {
  readyMapName.value = workbenchRef.value?.getName() || location.name;
  readyOpen.value = true;
}
const { data: planRegions } = useLocationMapRegions(location.id);
const { data: planDoors } = useSiteDoors(computed(() => siteSpaces.value.map((s) => s.id)));
const readyDarkness = computed<DarknessLevel>({
  get: () => workbenchRef.value?.getDarkness() ?? "daylight",
  set: (level) => workbenchRef.value?.setDarkness(level),
});
const readyRows = computed(() => {
  const regions = planRegions.value ?? [];
  const doors = planDoors.value ?? [];
  return playReadiness({
    location,
    siteType: location.location_type,
    spaces: siteSpaces.value,
    regions,
    doors: doors.map((d) => ({
      id: d.id,
      edge_key: d.edge_key,
      from_location_id: d.from_location_id,
      to_location_id: d.to_location_id,
      from_name: d.from_location?.name ?? null,
      to_name: d.to_location?.name ?? null,
    })),
    live: location.map_live,
    darkness: readyDarkness.value,
    hasDrawing: location.source_map_id !== null,
  });
});

/** Each fix lands the DM where it is made, in the editor. */
function onReadyFix(action: ReadyFixAction): void {
  const wb = workbenchRef.value;
  if (!wb) return;
  if (action.kind === "line-up") wb.startLineUp();
  else if (action.kind === "place-door") wb.armDoorPlacement(action.doorId);
  else if (action.kind === "link") wb.showSpaces();
}

// ── Levels ──────────────────────────────────────────────────────────────────
const levelsInfo = computed(() => levelsOf(index, location));
const levelList = computed<LocationSummary[]>(() => levelsInfo.value?.levels ?? [location]);
const { addLevel, isAdding: isAddingLevel } = useAddSiteLevel();
const showLevelPaywall = ref(false);

async function onAddLevel(): Promise<void> {
  await autosave.flush();
  const outcome = await addLevel(levelsInfo.value?.container ?? location, levelList.value.length + 1);
  if (outcome === "quota") showLevelPaywall.value = true;
}

/** Saves the drawing first, then opens the other level's editor on the same layer. */
async function onLevelSelect(id: string): Promise<void> {
  await autosave.flush();
  void router.push(mapEditorRoute(id, startLayer));
}

// ── Publish / style / download ──────────────────────────────────────────────
/** The saved row with the canvas's live edits laid over it, or null while
 *  there is no workbench or no saved Drawing yet. Soft rather than throwing:
 *  `useMapPublish` reads these getters continuously, from setup on. */
function liveMap() {
  const wb = workbenchRef.value;
  return wb && siteSourceMap.value
    ? { ...siteSourceMap.value, layers: wb.getLayers(), metadata: wb.getMetadata() }
    : null;
}

const mapPublish = useMapPublish({
  map: liveMap,
  runtimes: () => workbenchRef.value?.getRuntimes() ?? new Map(),
  dressing: () => workbenchRef.value?.getDressingCatalog() ?? new Map(),
  loadDressing: () => workbenchRef.value?.loadDressingCatalog() ?? Promise.resolve(new Map()),
  glyphs: () => workbenchRef.value?.getCellGlyphs() ?? {},
  structure: () => workbenchRef.value?.getStructure() ?? { spaces: [], ways: [], stairs: [], links: [] },
});

const {
  baking,
  showStylePicker,
  showStyleResult,
  selectedPresetId,
  stylePromptSuffix,
  styleGenerating,
  styleResultUrl,
  styleError,
  styleAtlasLocationId,
  styleAtlasError,
  styleAtlasSaving,
  styleAtlasTargetHasMap,
  styleFixedTargetLabel,
  styleByok,
  styleCost,
  onGenerateStyle,
  onRetryStyle,
  onDownloadStyled,
  onSaveStyledToAtlas,
} = useMapExport({
  buildMap: liveMap,
  runtimes: () => workbenchRef.value?.getRuntimes() ?? new Map(),
  loadDressing: () => workbenchRef.value?.loadDressingCatalog() ?? Promise.resolve(new Map()),
  mapName: () => workbenchRef.value?.getName() ?? location.name,
  glyphs: () => workbenchRef.value?.getCellGlyphs() ?? {},
  site: () => ({ id: location.id, name: location.name, picture: mapStack.value.picture }),
});

async function openPublish(): Promise<void> {
  // Publishing reads the saved row's rev, so what is on the canvas goes first.
  await autosave.flush();
  mapPublish.targetSiteId.value = location.id;
  mapPublish.open.value = true;
}

async function openStyle(): Promise<void> {
  if (!campaignAiEnabled.value) return;
  await autosave.flush();
  showStylePicker.value = true;
}

async function downloadPng(): Promise<void> {
  if (baking.value) return;
  await autosave.flush();
  const map = liveMap();
  const wb = workbenchRef.value;
  if (!map || !wb) {
    toast.info("Draw something first, then download it.");
    return;
  }
  baking.value = true;
  try {
    const blob = await bakeMapAsPng(map, wb.getRuntimes(), await wb.loadDressingCatalog(), {}, wb.getCellGlyphs());
    downloadBlob(blob, `${wb.getName() || location.name}.png`);
  } finally {
    baking.value = false;
  }
}

async function exportVtt(): Promise<void> {
  await autosave.flush();
  const map = liveMap();
  const wb = workbenchRef.value;
  if (!map || !wb) {
    toast.info("Draw something first, then export it.");
    return;
  }
  try {
    await exportDrawingAsVtt(map, wb.getRuntimes(), await wb.loadDressingCatalog(), wb.getCellGlyphs(), wb.getName() || location.name);
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

const { mutateAsync: updateLocation } = useUpdateLocation();
const deleteMap = useDeleteDungeonMap();

/** Unlinks the Drawing, takes its published layer off the site and deletes the
 *  map: a site must not go on showing a drawing that no longer exists. The
 *  rooms, doors and Picture are the site's own and stay. */
async function deleteDrawing(): Promise<void> {
  const mapId = location.source_map_id;
  if (!mapId) return;
  const ok = await confirm(`Delete the drawing of "${location.name}"? This cannot be undone.`, {
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  autosave.onDirtyChange(false);
  await updateLocation({
    id: location.id,
    update: {
      source_map_id: null,
      map_layer_url: null,
      map_layer_stand_url: null,
      map_layer_stand_live_url: null,
      map_layer_calibration: null,
      map_live: null,
      map_published_rev: null,
    },
  });
  await deleteMap.mutateAsync(mapId);
  void router.push(backTo);
}

// The Map menu has nothing to offer until a Drawing is saved: every entry
// works on that row.
const menuActions = computed<MapMenuAction[]>(() =>
  location.source_map_id
    ? [...(campaignAiEnabled.value ? (["style"] as const) : []), "review", "download", "export-vtt", "delete"]
    : [],
);

function onMenuAction(action: MapMenuAction): void {
  if (action === "style") void openStyle();
  else if (action === "review") void openPublish();
  else if (action === "download") void downloadPng();
  else if (action === "export-vtt") void exportVtt();
  else if (action === "delete") void deleteDrawing();
}
</script>
