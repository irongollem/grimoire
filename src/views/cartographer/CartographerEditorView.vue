<template>
  <!-- The standalone Cartographer is always the editor (#1125): the app's
       sidebar and bars give way (`editorFocus`) and the workbench fills the
       screen under one slim bar. It saves itself, so there is no Save,
       Cancel, Edit or Done; the Map menu carries style, publish, download
       and delete. -->
  <div class="h-dvh p-2">
    <MapWorkbench
      ref="workbenchRef"
      :map="seed"
      :view-mode="false"
      :save-state="saveState"
      :menu-actions="menuActions"
      :frame="frame"
      @update:dirty="autosave.onDirtyChange"
      @update:edit-revision="autosave.onEditRevision"
      @menu-action="onMenuAction"
    >
      <template #bar-start="{ mapName, setName }">
        <AppButton
          to="/cartographer"
          variant="ghost"
          fill="muted"
          size="icon-sm"
          class="shrink-0"
          :icon="IconChevronLeft"
          aria-label="Back to maps"
          tooltip="Back to maps"
        />
        <AppInput
          :model-value="mapName"
          tone="underline"
          size="body"
          class="w-24 shrink-0 sm:w-56"
          aria-label="Map name"
          placeholder="Untitled Map"
          @update:model-value="setName"
        />
      </template>
    </MapWorkbench>

    <CartographerPublishModal
      v-model="mapPublish.open.value"
      v-model:target-site-id="mapPublish.targetSiteId.value"
      :site-context="mapPublish.siteContext.value"
      :stair-targets="mapPublish.stairTargets.value"
      :review="mapPublish.review.value"
      @pick-stair-target="(cellKey, id) => (mapPublish.stairTargets.value = { ...mapPublish.stairTargets.value, [cellKey]: id })"
      @publish="mapPublish.publish()"
    />

    <CartographerAiStyleModal
      v-model:atlasLocationId="styleAtlasLocationId"
      :show-picker="showStylePicker && isAiEnabled"
      :show-result="showStyleResult"
      :presets="CARTOGRAPHER_STYLE_PRESETS"
      :selected-preset-id="selectedPresetId"
      :prompt-suffix="stylePromptSuffix"
      :generating="styleGenerating"
      :error="styleError"
      :result-url="styleResultUrl"
      :location-options="locationOptions"
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
// Thin route host for the Cartographer editor (epic #884 S6; always the
// editor and always autosaving since #1125) — route params, loading the
// `dungeon_maps` row, the autosave (`useDrawingAutosave`), Delete, the
// Publish modal, the AI style flow, and mounting `MapWorkbench`. All
// canvas/tool/options behaviour lives in MapWorkbench; this file owns only
// what needs the route or a mutation.
//
// MapWorkbench doesn't hand its editable state up continuously — painting
// mutates layers on nearly every pointer move, so a two-way emit surface for
// that would mean deep-cloning on every frame. Instead this host reads a
// snapshot through `workbenchRef`'s exposed getters only at the moments it
// actually needs one: the autosave, opening Publish/AI-Style, the PNG bake.
// See MapWorkbench's own docblock for the full exposed surface.
import { computed, onBeforeUnmount, ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";

import { IconChevronLeft } from "@/lib/icons";

import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CartographerAiStyleModal from "@/components/cartographer/CartographerAiStyleModal.vue";
import CartographerPublishModal from "@/components/cartographer/CartographerPublishModal.vue";
import MapWorkbench from "@/components/cartographer/MapWorkbench.vue";
import { useMapPublish } from "@/composables/cartographer/useMapPublish";
import { useMapExport } from "@/composables/cartographer/useMapExport";

import { useDungeonMap, useDeleteDungeonMap } from "@/composables/cartographer/useDungeonMaps";
import { useDrawingAutosave } from "@/composables/locations/useDrawingAutosave";
import { useSeededMap } from "@/composables/locations/useSeededMap";
import { useConfirm } from "@/composables/useConfirm";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";
import { useAllLocations } from "@/composables/locations/useLocations";
import { bakeMapAsPng } from "@/cartographer/bake";
import { CARTOGRAPHER_STYLE_PRESETS } from "@/cartographer/stylePresets";
import type { MapMenuAction } from "@/cartographer/tools";
import { downloadBlob } from "@/lib/downloadBlob";
import { exportDrawingAsVtt } from "@/lib/mapBring/exportDrawing";
import { useToast } from "@/composables/useToast";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const mapId = computed(() => {
  const p = route.params.id;
  return typeof p === "string" && p ? p : "";
});
// The AI Style control is hidden, not disabled, while the campaign owner has AI off.
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);

// Editing takes the screen: the shell hides its sidebar and bars while this is
// mounted, and gives them back the moment the map is left.
const appUi = useAppUiStore();
appUi.editorFocus = true;
onBeforeUnmount(() => { appUi.editorFocus = false; });

// "Start a map" passes the size the DM asked for (`?size=30x20`) as the view an empty map opens on.
const frame = computed(() => {
  const m = typeof route.query.size === "string" ? /^(\d{1,3})x(\d{1,3})$/.exec(route.query.size) : null;
  return m ? { cols: Number(m[1]), rows: Number(m[2]) } : undefined;
});

const { data: map } = useDungeonMap(mapId);
const deleteMutation = useDeleteDungeonMap();
const { confirm } = useConfirm();

const deleting = ref(false);

// "Start a map" creates the row before this opens, so an edit only ever updates it. Should its row vanish under the
// editor (deleted elsewhere), the next save makes a fresh one and the address follows it; the workbench already holds
// those edits, so the new id must not be loaded back into it (`useSeededMap`).
const autosave = useDrawingAutosave({
  target: computed(() => ({ mapId: mapId.value || null, fallbackName: "Untitled Map" })),
  tags: () => map.value?.tags ?? [],
  onCreated: async (id) => { await router.replace({ path: `/cartographer/${id}` }); },
});
const workbenchRef = autosave.workbenchRef;
const seed = useSeededMap({
  source: () => map.value,
  scope: () => (mapId.value === autosave.createdMapId.value ? "created" : mapId.value),
  skipId: () => autosave.createdMapId.value,
});

/** For the host-owned closures that only ever run from a menu action
 *  (useMapExport, the PNG bake): by then MapWorkbench is certainly mounted,
 *  so a missing ref there is a real bug. useMapPublish is not one of
 *  them: its computeds read their getters from setup on, which is before the
 *  workbench mounts whenever the map is already cached, so its getters below
 *  degrade to "nothing to publish" instead (DUNGEON-GRIMOIRE-Q/R/S/T), the way
 *  AtlasSiteMapMode's do. */
function requireWorkbench(): NonNullable<typeof workbenchRef.value> {
  const wb = workbenchRef.value;
  if (!wb) throw new Error("MapWorkbench is not mounted");
  return wb;
}

// Location picker source for the AI Style modal's "Save to Atlas" mini-flow.
const { data: allLocationsData } = useAllLocations();
const locationOptions = computed(() =>
  (allLocationsData.value ?? []).map((l) => ({ id: l.id, name: l.name })),
);

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
  styleByok,
  styleCost,
  onGenerateStyle,
  onRetryStyle,
  onDownloadStyled,
  onSaveStyledToAtlas,
} = useMapExport({
  buildMap: () => (map.value ? { ...map.value, layers: requireWorkbench().getLayers(), metadata: requireWorkbench().getMetadata() } : null),
  runtimes: () => requireWorkbench().getRuntimes(),
  loadDressing: () => requireWorkbench().loadDressingCatalog(),
  mapName: () => requireWorkbench().getName(),
  glyphs: () => requireWorkbench().getCellGlyphs(),
});

// The publish review is read while the page renders (the header's Publish button and modal), and the header renders
// before the workbench below it mounts: on opening a map, and on every switch between view and edit, which mount a
// workbench of their own. So `map` answers "no map yet" until a workbench is there, and the review recomputes the
// moment it is (`workbenchRef` is reactive). Its other getters degrade to empty the same way; export and save keep the
// strict guard, since they only run from a button.
const mapPublish = useMapPublish({
  map: () => {
    const wb = workbenchRef.value;
    return wb && map.value ? { ...map.value, layers: wb.getLayers(), metadata: wb.getMetadata() } : null;
  },
  runtimes: () => workbenchRef.value?.getRuntimes() ?? new Map(),
  dressing: () => workbenchRef.value?.getDressingCatalog() ?? new Map(),
  loadDressing: () => workbenchRef.value?.loadDressingCatalog() ?? Promise.resolve(new Map()),
  glyphs: () => workbenchRef.value?.getCellGlyphs() ?? {},
  structure: () => workbenchRef.value?.getStructure() ?? { spaces: [], ways: [], stairs: [], links: [] },
});

const saveState = computed(() => {
  if (autosave.saving.value) return "Saving…";
  if (autosave.dirty.value) return "Unsaved changes";
  return "Saved";
});

// ── The Map menu ──────────────────────────────────────────────────────────

const menuActions = computed<MapMenuAction[]>(() => [
  ...(isAiEnabled.value ? (["style"] as const) : []),
  "review",
  "download",
  "export-vtt",
  "delete",
]);

async function onMenuAction(action: MapMenuAction): Promise<void> {
  if (action === "style") {
    await autosave.flush();
    showStylePicker.value = true;
  } else if (action === "review") {
    // Publish reads the saved row's rev, so what is on the canvas goes first.
    await autosave.flush();
    mapPublish.open.value = true;
  } else if (action === "download") {
    await onDownloadPng();
  } else if (action === "export-vtt") {
    await onExportVtt();
  } else if (action === "delete") {
    await onDelete();
  }
}

async function onDownloadPng(): Promise<void> {
  if (baking.value || !map.value) return;
  const wb = requireWorkbench();
  baking.value = true;
  try {
    const bakedMap = { ...map.value, layers: wb.getLayers(), metadata: wb.getMetadata() };
    const blob = await bakeMapAsPng(bakedMap, wb.getRuntimes(), await wb.loadDressingCatalog(), {}, wb.getCellGlyphs());
    downloadBlob(blob, `${wb.getName() || "map"}.png`);
  } finally {
    baking.value = false;
  }
}

async function onExportVtt(): Promise<void> {
  if (!map.value) {
    toast.info("Draw something first, then export it.");
    return;
  }
  const wb = requireWorkbench();
  try {
    await exportDrawingAsVtt(
      { ...map.value, layers: wb.getLayers(), metadata: wb.getMetadata() },
      wb.getRuntimes(),
      await wb.loadDressingCatalog(),
      wb.getCellGlyphs(),
      wb.getName() || "map",
    );
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}

async function onDelete(): Promise<void> {
  if (deleting.value || !mapId.value) return;
  const currentName = workbenchRef.value?.getName() ?? "";
  const ok = await confirm(`Delete "${currentName || "this map"}"? This cannot be undone.`);
  if (!ok) return;
  deleting.value = true;
  try {
    await deleteMutation.mutateAsync(mapId.value);
    autosave.onDirtyChange(false);
    router.push("/cartographer");
  } finally {
    deleting.value = false;
  }
}

// Leaving saves what is pending first; the guard below only speaks if that
// save failed (or is somehow still going), so the DM is never asked about
// work the page has already put away. Registered before the guard: the
// router runs leave guards in registration order.
onBeforeRouteLeave(async () => { await autosave.flush(); });
onBeforeUnmount(() => { void autosave.flush(); });

useUnsavedGuard({
  isDirty: () => (autosave.dirty.value || autosave.saving.value) && !deleting.value,
  // A save that has to make the row again swaps the address for the map's own on this same component: nothing is
  // discarded, so no prompt.
  survives: (to) => to.name === route.name || to.name === "cartographer-editor",
  ask: () =>
    confirm("Unsaved changes will be lost. Leave anyway?", {
      title: "Discard changes",
      confirmLabel: "Discard",
    }),
});
</script>
