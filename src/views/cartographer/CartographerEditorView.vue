<template>
  <!-- View: the page as it always was, a header over the map. -->
  <PageHeader v-if="viewMode" :title="map?.name ?? 'New Map'" :description="statusLine">
    <template #actions>
      <AppButton
        variant="subtle"
        fill="muted"
        size="sm"
        :disabled="baking"
        tooltip="Download map as PNG"
        :label="baking ? 'Baking…' : '↓ PNG'"
        @click="onDownloadPng"
      />
      <AppButton
        v-if="isAiEnabled"
        variant="tinted"
        tone="primary"
        emphasis="outline"
        size="sm"
        :disabled="baking || styleGenerating"
        tooltip="Re-render this map in an artistic style using AI"
        :label="styleGenerating ? 'Styling…' : 'AI Style'"
        @click="showStylePicker = true"
      >
        <template #icon>
          <IconGenerate class="h-3.5 w-3.5" :class="{ 'animate-pulse': styleGenerating }" />
        </template>
      </AppButton>
      <AppButton
        variant="tinted"
        tone="primary"
        emphasis="outline"
        size="sm"
        :icon="IconUpload"
        :disabled="mapPublish.review.value.publishing"
        :label="mapPublish.review.value.publishing ? 'Publishing…' : 'Publish to Atlas'"
        @click="mapPublish.open.value = true"
      />
      <ListActionButton label="Edit" @click="onEdit" />
      <ListActionButton variant="primary" label="Done" @click="onDone" />

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
    </template>

    <MapWorkbench
      ref="workbenchRef"
      :map="map ?? null"
      :view-mode="true"
      @update:dirty="dirty = $event"
    />
  </PageHeader>

  <!-- Edit: no page header. The app's sidebar and bars give way (`editorFocus`) and the
       workbench fills the screen under one slim bar, the map's name and Delete / Cancel /
       Save at its two ends: building a map wants the map, not the page around it. -->
  <div v-else class="h-dvh p-2">
    <MapWorkbench
      ref="workbenchRef"
      :map="map ?? null"
      :view-mode="false"
      :save-state="saveState"
      @update:dirty="dirty = $event"
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
      <template #bar-end>
        <AppButton
          v-if="!isNew"
          variant="destructive"
          size="sm"
          class="shrink-0"
          :disabled="deleting"
          :label="deleting ? 'Deleting…' : 'Delete'"
          @click="onDelete"
        />
        <ListActionButton label="Cancel" @click="onCancel" />
        <ListActionButton
          variant="primary"
          :icon="IconSave"
          label="Save"
          :disabled="saving"
          @click="onSave"
        />
      </template>
    </MapWorkbench>
  </div>
</template>

<script setup lang="ts">
// Thin route host for the Cartographer editor (epic #884 S6) — route params,
// loading the `dungeon_maps` row, Save/Cancel/Delete, the Publish modal, the
// AI style flow, and mounting `MapWorkbench`. All canvas/tool/options
// behaviour lives in MapWorkbench now; this file owns only what needs the
// route (`isNew`/`viewMode`, navigation, `useUnsavedGuard`) or a mutation
// (create/update/delete).
//
// MapWorkbench doesn't hand its editable state up continuously — painting
// mutates layers on nearly every pointer move, so a two-way emit surface for
// that would mean deep-cloning on every frame. Instead this host reads a
// snapshot through `workbenchRef`'s exposed getters only at the moments it
// actually needs one: Save, Cancel, opening Publish/AI-Style, the PNG bake.
// See MapWorkbench's own docblock for the full exposed surface.
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useRoute, useRouter } from "vue-router";

import { IconChevronLeft, IconSave, IconGenerate, IconUpload } from "@/lib/icons";

import PageHeader from "@/components/common/list/PageHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ListActionButton from "@/components/common/list/ListActionButton.vue";
import CartographerAiStyleModal from "@/components/cartographer/CartographerAiStyleModal.vue";
import CartographerPublishModal from "@/components/cartographer/CartographerPublishModal.vue";
import MapWorkbench from "@/components/cartographer/MapWorkbench.vue";
import { useMapPublish } from "@/composables/cartographer/useMapPublish";
import { useMapExport } from "@/composables/cartographer/useMapExport";

import {
  useDungeonMap,
  useCreateDungeonMap,
  useUpdateDungeonMap,
  useDeleteDungeonMap,
} from "@/composables/cartographer/useDungeonMaps";
import { useConfirm } from "@/composables/useConfirm";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";
import { useAllLocations } from "@/composables/locations/useLocations";
import { bakeMapAsPng } from "@/cartographer/bake";
import { CARTOGRAPHER_STYLE_PRESETS } from "@/cartographer/stylePresets";
import type { DungeonMap } from "@/types/dungeonMap.types";
import { downloadBlob } from "@/lib/downloadBlob";

const route = useRoute();
const router = useRouter();

const mapId = computed(() => {
  const p = route.params.id;
  return typeof p === "string" && p ? p : "";
});
// The AI Style control is hidden, not disabled, while the campaign owner has AI off.
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const isNew = computed(() => !mapId.value);
// View vs edit mode — derived from the URL (matches the NPC/Location/Item convention).
// `/cartographer/:id`           → view mode
// `/cartographer/:id?edit=true` → edit mode
// `/cartographer/new`           → always edit mode
const viewMode = computed(() => !isNew.value && route.query.edit !== "true");

// Editing takes the screen: the shell hides its sidebar and bars while this is set, and
// gives them back the moment the map is left or put down.
const appUi = useAppUiStore();
watch(() => !viewMode.value, (editing) => { appUi.editorFocus = editing; }, { immediate: true });
onBeforeUnmount(() => { appUi.editorFocus = false; });

const { data: map } = useDungeonMap(mapId);
const createMutation = useCreateDungeonMap();
const updateMutation = useUpdateDungeonMap();
const deleteMutation = useDeleteDungeonMap();
const { confirm } = useConfirm();

const saving = ref(false);
const deleting = ref(false);
// Mirrors MapWorkbench's `update:dirty` — used by this host's own
// useUnsavedGuard/statusLine, both of which need route state
// (isNew/route.name) the workbench doesn't have.
const dirty = ref(false);

const workbenchRef = ref<InstanceType<typeof MapWorkbench> | null>(null);

/** For the host-owned closures that only ever run from a view-mode button
 *  (useMapExport, the PNG bake, save): by then MapWorkbench is certainly
 *  mounted, so a missing ref there is a real bug. useMapPublish is not one of
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

// `workbenchRef` is null for the very first render (template refs populate
// once the child mounts) — this falls back to blank/zero for that one tick
// rather than a full recompute; it self-heals as soon as the ref is set.
const statusLine = computed(() => {
  if (isNew.value) return "New map: paint a floor, then save.";
  const wb = workbenchRef.value;
  const packName = wb?.getPackName() ?? "";
  const cellsPainted = wb?.getCellsPainted() ?? 0;
  // `map` is null until the map has actually loaded — a map with no rev yet
  // is not rev 0, it's unknown, so the segment is absent rather than
  // coerced. "Saved" is never spelled out; its absence IS the saved state.
  const revSegment = map.value ? ` · rev ${map.value.rev}` : "";
  const unsavedSegment = dirty.value ? " · unsaved changes" : "";
  return `${packName} · ${cellsPainted} cells painted${revSegment}${unsavedSegment}`;
});

// The bar's own save state: the saved state says nothing, as the status line always did.
const saveState = computed(() => {
  if (saving.value) return "Saving…";
  if (dirty.value) return "Unsaved changes";
  return isNew.value ? "New map" : "";
});

// ── Save / cancel ──────────────────────────────────────────────────────────

async function onSave(): Promise<void> {
  if (saving.value) return;
  const wb = requireWorkbench();
  saving.value = true;
  try {
    const payload = {
      name: wb.getName().trim() || "Untitled Map",
      description: null,
      layers: wb.getLayers(),
      metadata: wb.getMetadata(),
      default_pack_id: wb.getCurrentPackId(),
      darkness: wb.getDarkness(),
      tags: (map.value as DungeonMap | null)?.tags ?? [],
      notes: null as unknown,
      campaign_id: wb.getCampaignId(),
    };
    if (isNew.value) {
      const result = await createMutation.mutateAsync(payload);
      wb.markSaved();
      await router.replace({ path: `/cartographer/${result.id}` });
    } else {
      await updateMutation.mutateAsync({ id: mapId.value, update: payload });
      wb.markSaved();
      // Drop ?edit=true → view mode.
      await router.replace({ query: {} });
    }
  } finally {
    saving.value = false;
  }
}

function onCancel(): void {
  if (mapId.value) {
    // Editing an existing map — restore saved state and return to view mode.
    workbenchRef.value?.resetEdits();
    router.replace({ query: {} });
  } else {
    router.push("/cartographer");
  }
}

function onEdit(): void {
  router.push({ query: { edit: "true" } });
}

function onDone(): void {
  router.push("/cartographer");
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

async function onDelete(): Promise<void> {
  if (deleting.value || isNew.value || !mapId.value) return;
  const currentName = workbenchRef.value?.getName() ?? "";
  const ok = await confirm(`Delete "${currentName || "this map"}"? This cannot be undone.`);
  if (!ok) return;
  deleting.value = true;
  try {
    await deleteMutation.mutateAsync(mapId.value);
    dirty.value = false;
    router.push("/cartographer");
  } finally {
    deleting.value = false;
  }
}

// The three suppressing conditions are carried over verbatim from the guard
// this replaced, and none of them is redundant with `dirty`:
//
// - `saving`/`deleting` cover this component's own navigations for their whole
//   duration. `onDelete` does clear `dirty` before its `router.push`, but only
//   once the mutation resolves; the flag covers the window before that.
// - `viewMode` is a computed over `route.query.edit`, not a state that clears
//   anything. The canvas is not editable there, so a `dirty` left over from an
//   earlier edit session must not raise a prompt.
//
// Folding them into `isDirty` rather than calling `allowLeave()` on each exit
// path keeps the whole rule in one place and leaves no flag to forget to set.
useUnsavedGuard({
  isDirty: () => dirty.value && !saving.value && !deleting.value && !viewMode.value,
  // Unlike NoteEditor, this component *is* the route component — nothing mounts
  // it behind a `v-if` on `?edit=true`. So toggling that query (the browser's
  // Back button leaving edit mode) keeps the editor mounted with its layers and
  // metadata untouched, and there is nothing to discard. Saying so matters
  // because the guard now registers onBeforeRouteUpdate as well as
  // onBeforeRouteLeave: the hand-rolled leave-only guard this replaced never
  // saw that transition at all, so without this the swap would have introduced
  // a prompt where none belongs.
  survives: (to) => to.name === route.name && to.params.id === route.params.id,
  ask: () =>
    confirm("Unsaved changes will be lost. Leave anyway?", {
      title: "Discard changes",
      confirmLabel: "Discard",
    }),
});
</script>
