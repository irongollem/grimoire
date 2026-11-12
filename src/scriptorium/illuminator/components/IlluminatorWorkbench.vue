<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex flex-col bg-background text-foreground"
      role="dialog"
      aria-modal="true"
      :aria-label="`Illuminating: ${name}`"
      data-testid="illuminator-workbench"
    >
      <header class="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-5">
        <h1 class="min-w-0 truncate font-heading text-heading-sm">Illuminating: {{ name }}</h1>
        <ManualHelpLink page="illuminator-image-effects" />
        <div class="flex-1" />

        <div ref="saveMenuRoot" class="relative">
          <AppButton variant="outline" size="sm" :icon="IconSave" label="Save as a new picture…" :disabled="!wb.image.value || wb.busy.value" :loading="wb.busy.value" @click="saveMenu = !saveMenu" />
          <div v-if="saveMenu" data-slip class="absolute right-0 top-full z-10 mt-1 flex w-64 flex-col gap-1 p-2" data-testid="save-as-menu">
            <p class="px-1 pb-1 text-caption text-muted-foreground">The picture in the book stays as it is.</p>
            <AppButton variant="ghost" size="sm" class="justify-start" :icon="IconDownload" label="Download as PNG" @click="pick(wb.downloadPng)" />
            <AppButton
              variant="ghost"
              size="sm"
              class="justify-start"
              :icon="wb.copied.value ? IconCheck : IconClipboard"
              :label="wb.copied.value ? 'Copied' : 'Copy to the clipboard'"
              :disabled="!wb.clipboardSupported"
              @click="pick(wb.copyPng)"
            />
            <AppButton variant="ghost" size="sm" class="justify-start" :icon="IconImage" label="Add to my pictures" @click="pick(wb.saveAsNewPicture)" />
          </div>
        </div>

        <AppButton variant="outline" size="sm" label="Cancel" @click="emit('cancel')" />
        <AppButton variant="primary" size="sm" :label="`Done, back to ${pageLabel}`" :disabled="!wb.image.value || finishing" :loading="finishing" data-testid="workbench-done" @click="done" />
      </header>

      <div class="flex min-h-0 flex-1">
        <IlluminateToolRail v-model:tool="wb.tool.value" :colour="paint.colour.value" @open-colour="openColourTab" />

        <div v-if="armedPaintTool" class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="paint-area">
          <PaintOptionsBar
            v-if="paint.ready.value && paint.optionValues.value && paint.brush.value"
            :tool="armedPaintTool"
            :brush-name="paint.brush.value.name"
            :mode="paint.brush.value.blend"
            :values="paint.optionValues.value"
            @change="(field, value) => paint.setOption(field, value)"
            @update:mode="paint.setMode"
            @open-library="openBrushes"
            @open-settings="paintView = 'settings'"
          >
            <template #tip>
              <PaintPreviewCanvas v-if="tipPixels" :pixels="tipPixels" :scale="2" />
            </template>
          </PaintOptionsBar>

          <PaintStageFrame :ready="paint.session.value !== null && paint.compositor.value !== null" :message="wb.paintError.value || wb.loadError.value">
            <PaintStage
              v-if="paint.session.value && paint.compositor.value"
              ref="paintStage"
              :session="paint.session.value"
              :compositor="paint.compositor.value"
              :cursor="paint.cursor.value"
              :tool="armedPaintTool"
              :before-stroke="paint.mayStroke"
              @picked="paint.onPicked"
              @stroke-start="paint.onStrokeStart"
              @stroke-end="paint.onStrokeEnd"
              @pen="paint.onPen"
            />
          </PaintStageFrame>

          <div class="flex items-center gap-4 border-t border-border bg-card px-3 py-1.5 text-caption text-muted-foreground" data-testid="pen-status">
            <span>Pressure <span class="tabular-nums text-foreground">{{ penPressure }}</span></span>
            <span>Tilt <span class="tabular-nums text-foreground">{{ penTilt }}</span></span>
            <AppButton class="ml-auto" variant="ghost" size="xs" label="Pen" data-testid="open-pen" @click="paintView = 'pen'" />
          </div>
        </div>

        <IlluminateStage
          v-else
          ref="stage"
          v-model:compare-pos="wb.comparePos.value"
          :size="wb.previewSize.value"
          :show-original="wb.showOriginal.value"
          :compare-off="wb.tool.value === 'focus' || wb.tool.value === 'crop'"
          :cursor-class="cursorClass"
          :load-error="wb.loadError.value"
          @canvas-click="wb.onCanvasClick"
        >
          <IlluminateCropBox v-if="wb.tool.value === 'crop'" :crop="wb.crop" :locked="cropLocked" @drag="wb.dragCropBox" />
        </IlluminateStage>

        <aside v-if="armedPaintTool" aria-label="Painting" class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card" data-testid="paint-panel">
          <template v-if="paintView !== 'tabs'">
            <div class="border-b border-border p-2">
              <AppButton variant="ghost" size="xs" :icon="IconChevronLeft" label="Back" data-testid="paint-back" @click="paintView = 'tabs'" />
            </div>
            <BrushSettingsPanel
              v-if="paintView === 'settings' && paint.brush.value"
              :brush="paint.brush.value"
              :assets="paint.assets"
              @update:brush="paint.updateBrush"
              @reset="paint.resetBrush"
              @save-as-new="paint.saveAsNewBrush"
            />
            <PenPanel v-else-if="paintView === 'pen'" :curve="paint.curve.value" :reported="paint.reported.value" @update:curve="paint.setCurve" />
          </template>
          <template v-else>
            <TabBar v-model="paintTab" :tabs="PAINT_TABS" />
            <BrushLibraryPanel
              v-if="paintTab === 'brushes' && paint.brush.value"
              :brushes="paint.library.value"
              :selected-id="paint.brush.value.id"
              :assets="paint.assets"
              @select="onSelectBrush"
              @new="onNewBrush"
            />
            <LayersPanel
              v-else-if="paintTab === 'layers'"
              :layers="paint.layers.value"
              :active-id="paint.activeLayerId.value"
              :can-delete="paint.canDeleteActive.value"
              :can-merge-down="paint.canMergeActive.value"
              :can-flatten="paint.hasPaintLayers.value"
              :thumbnail="paint.thumbnail"
              :revision="paint.revision.value"
              @select="paint.selectLayer"
              @set-visible="(id, visible) => paint.setLayerProps(id, { visible })"
              @set-props="paint.setLayerProps"
              @commit-opacity="paint.commitOpacity"
              @add="paint.addLayer"
              @delete="paint.deleteLayer"
              @merge-down="paint.mergeDown"
              @move="paint.moveLayer"
              @flatten="flatten"
            />
            <ColourPanel v-else-if="paintTab === 'colour'" :colour="paint.colour.value" :recent="paint.recent.value" @update:colour="paint.setColour" />
          </template>
        </aside>

        <aside v-else :aria-label="toolTitle" class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
          <div class="flex flex-col gap-0.5 px-4 pt-4">
            <span class="text-eyebrow uppercase text-muted-foreground">Tool</span>
            <span class="font-heading text-heading-sm">{{ toolTitle }}</span>
          </div>

          <IlluminateCropPanel
            v-if="wb.tool.value === 'crop'"
            :shape="wb.cropShape.value"
            :crop="wb.crop"
            :page-aspect="wb.pageAspect.value"
            @shape="wb.setCropShape"
            @reset="wb.resetCrop"
          />

          <IlluminateEdgesTool
            v-else-if="wb.tool.value === 'edges'"
            :edge-style="wb.edgeStyle.value"
            :classic="wb.classic"
            :paper="wb.paper"
            @style-change="wb.setEdgeStyle"
            @side="wb.setEdgeSideEnabled"
            @paper-slider="onPaperSlider"
            @classic-slider="onClassicSlider"
          />

          <IlluminateColorGradingPanel
            v-else-if="wb.tool.value === 'grade'"
            :grading="wb.grading"
            :enabled="wb.gradingEnabled.value"
            :open="true"
            @update:enabled="wb.gradingEnabled.value = $event"
            @set-slider="(key, value) => (wb.grading[key] = value)"
            @apply-preset="onPreset"
            @reset="Object.assign(wb.grading, DEFAULT_COLOUR_GRADING)"
          />

          <IlluminateVignettePanel
            v-else-if="wb.tool.value === 'vignette'"
            :vignette="wb.vignette"
            :enabled="wb.vignetteEnabled.value"
            :open="true"
            @update:enabled="wb.vignetteEnabled.value = $event"
            @set-mode="wb.vignette.mode = $event"
            @set-colour="wb.vignette.colour = $event"
            @set-field="(key, value) => (wb.vignette[key] = value)"
          />

          <IlluminateTexturePanel
            v-else-if="wb.tool.value === 'texture'"
            :texture="wb.texture"
            :enabled="wb.textureEnabled.value"
            :open="true"
            :has-image="wb.textureUrl.value !== null"
            :filename="wb.textureFilename.value"
            @update:enabled="wb.textureEnabled.value = $event"
            @pick-file="textureInput?.click()"
            @drop-file="onTextureDrop"
            @clear="wb.clearTexture"
            @set-blend-mode="wb.texture.blendMode = $event"
            @set-field="(key, value) => (wb.texture[key] = value)"
          />

          <div v-else-if="wb.tool.value === 'wash'" class="flex flex-col gap-3 px-4 py-4">
            <p class="text-caption italic text-muted-foreground">
              Paint the page's paper over part of the picture, with a dry brush edge where the painting shows faintly through.
            </p>
            <IlluminateWashPanel
              :wash="wb.wash.value"
              @on="wb.wash.value = newWash(freshSeed())"
              @side="wb.wash.value = wb.wash.value && { ...wb.wash.value, from: $event }"
              @field="(field, value) => (wb.wash.value = wb.wash.value && { ...wb.wash.value, [field]: value })"
              @repaint="wb.wash.value = wb.wash.value && { ...wb.wash.value, seed: freshSeed() }"
              @remove="wb.wash.value = null"
            />
          </div>

          <IlluminateDofPanel
            v-else-if="wb.tool.value === 'focus'"
            :dof="wb.dof"
            :enabled="wb.dofEnabled.value"
            :open="true"
            :has-image="wb.image.value !== null"
            @update:enabled="wb.dofEnabled.value = $event"
            @set-falloff="wb.dof.falloff = $event"
            @set-field="(key, value) => (wb.dof[key] = value)"
          />

          <input ref="textureInput" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="onTextureFile" />

          <div class="border-t border-border p-4">
            <AppButton variant="ghost" size="inline-xs" label="Reset all to defaults" :disabled="!wb.hasEdits.value" @click="wb.resetAll" />
          </div>

          <IlluminateAskSection
            :base-url="wb.baseUrl.value"
            :natural="baseSize"
            :document-id="documentId"
            :campaign-id="campaignId"
            :user-id="userId"
            :look="look"
            :has-ai-result="wb.aiStep.value !== null"
            @result="(url, action) => void wb.setAiResult(url, action)"
            @use-original="wb.clearAiResult"
          />
        </aside>
      </div>
      <PaywallModal v-model="showPaintPaywall" resource="paint_canvases" :message="PAINT_CANVAS_LIMIT_MESSAGE" />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The Illuminator, inside the book (#1176 frame 12): a full-screen workbench
 * over the Scriptorium, not a page of its own. It opens on a picture's recipe
 * and hands one back on Done; Cancel hands back nothing. Every tool the old
 * Illuminator page had is here: edges (now with the torn-paper tear), colour,
 * vignette, texture, focus and the brush, with a before/after divider, and
 * "Ask the Illuminator" (story 10) for the AI picture actions.
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import TabBar from "@/components/common/controls/TabBar.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { PAINT_CANVAS_LIMIT_MESSAGE } from "@/scriptorium/illuminator/lib/paintQuota";
import { useInvalidateQuota, useQuota } from "@/composables/billing/useQuota";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import IlluminateAskSection from "@/scriptorium/illuminator/components/IlluminateAskSection.vue";
import IlluminateCropBox from "@/scriptorium/illuminator/components/IlluminateCropBox.vue";
import IlluminateCropPanel from "@/scriptorium/illuminator/components/IlluminateCropPanel.vue";
import IlluminateColorGradingPanel from "@/scriptorium/illuminator/components/IlluminateColorGradingPanel.vue";
import IlluminateDofPanel from "@/scriptorium/illuminator/components/IlluminateDofPanel.vue";
import IlluminateEdgesTool from "@/scriptorium/illuminator/components/IlluminateEdgesTool.vue";
import IlluminateStage from "@/scriptorium/illuminator/components/IlluminateStage.vue";
import IlluminateTexturePanel from "@/scriptorium/illuminator/components/IlluminateTexturePanel.vue";
import IlluminateWashPanel from "@/scriptorium/illuminator/components/IlluminateWashPanel.vue";
import IlluminateToolRail from "@/scriptorium/illuminator/components/IlluminateToolRail.vue";
import IlluminateVignettePanel from "@/scriptorium/illuminator/components/IlluminateVignettePanel.vue";
import { DEFAULT_COLOUR_GRADING, type ColourGradingOptions } from "@/scriptorium/illuminator/lib/colourGrading";
import type { EdgeOptions } from "@/scriptorium/illuminator/lib/edgeTreatment";
import type { PaperSide } from "@/scriptorium/illuminator/lib/tornPaper";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { isArtLook } from "@edge-shared/scriptoriumLookStyles.ts";
import { scriptoriumLook } from "@/scriptorium/lib/looks";
import type { ScriptoriumTheme } from "@/scriptorium/types";
import { newWash } from "@/scriptorium/illuminator/lib/washEdits";
import BrushLibraryPanel from "@/scriptorium/illuminator/paint/components/BrushLibraryPanel.vue";
import BrushSettingsPanel from "@/scriptorium/illuminator/paint/components/BrushSettingsPanel.vue";
import ColourPanel from "@/scriptorium/illuminator/paint/components/ColourPanel.vue";
import LayersPanel from "@/scriptorium/illuminator/paint/components/LayersPanel.vue";
import PaintOptionsBar from "@/scriptorium/illuminator/paint/components/PaintOptionsBar.vue";
import PaintPreviewCanvas from "@/scriptorium/illuminator/paint/components/PaintPreviewCanvas.vue";
import PaintStageFrame from "@/scriptorium/illuminator/paint/components/PaintStageFrame.vue";
import PaintStage from "@/scriptorium/illuminator/paint/components/PaintStage.vue";
import PenPanel from "@/scriptorium/illuminator/paint/components/PenPanel.vue";
import { PREVIEW_INK } from "@/scriptorium/illuminator/paint/components/previewPaper";
import { renderTipPreview } from "@/scriptorium/illuminator/paint/render/brushPreview";
import { isPaintTool, useIlluminateWorkbench, type WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { useToast } from "@/composables/useToast";
import { IconChevronLeft, IconCheck, IconClipboard, IconDownload, IconImage, IconSave } from "@/lib/icons";

const { original, settings, name, pageLabel, userId, documentId, campaignId, theme, pageAspect = null, startTool = "edges" } = defineProps<{
  /** The untouched picture the recipe applies to. */
  original: string;
  /** The recipe it has now, or null for a picture with no edits. */
  settings: IlluminateSettings | null;
  /** What the picture is called in the title. */
  name: string;
  /** "page 3": where Done goes back to. */
  pageLabel: string;
  userId: string | undefined;
  /** The book or handout this picture is in: the AI actions are paid for against it. */
  documentId: string;
  /** That book's campaign (null for an account-wide book); AI picture actions need it to be the active one. */
  campaignId: string | null;
  /** Its look, so an AI picture can be asked for in the book's style. */
  theme: ScriptoriumTheme;
  /** Width over height of the page, for art placed on the page (the crop's Page shape); null for a picture in the text. */
  pageAspect?: number | null;
  /** The tool it opens on: Crop, from the panel's Crop button. */
  startTool?: WorkbenchTool;
}>();

const emit = defineEmits<{
  done: [settings: IlluminateSettings];
  /** The painting was flattened: this stored picture is the picture's new original, and its recipe is empty. */
  flatten: [original: string];
  cancel: [];
}>();

const toast = useToast();
const stage = ref<InstanceType<typeof IlluminateStage> | null>(null);
const paintStage = ref<InstanceType<typeof PaintStage> | null>(null);
const textureInput = ref<HTMLInputElement | null>(null);
const saveMenu = ref(false);
const saveMenuRoot = ref<HTMLElement | null>(null);
const finishing = ref(false);

// A picture's first paint layer makes a canvas, which the plan counts; the check is made before that stroke.
const { canCreate: canMakeCanvas } = useQuota("paint_canvases");
const invalidateQuota = useInvalidateQuota();
const showPaintPaywall = ref(false);

const wb = useIlluminateWorkbench({
  canMakeCanvas: () => canMakeCanvas.value,
  onCanvasRefused: () => {
    showPaintPaywall.value = true;
  },
  original: () => original,
  settings: () => settings,
  userId: () => userId,
  pageAspect: () => pageAspect,
  canvases: () => ({ before: stage.value?.beforeEl ?? null, after: stage.value?.afterEl ?? null }),
  redrawPaint: () => paintStage.value?.redraw(),
});
const paint = wb.paint;

wb.tool.value = startTool;

// The AI actions are paid for against a document the server checks belongs to the caller; the chapter editor
// that opens the workbench knows it and its look.
const look = computed(() => {
  const { id, label } = scriptoriumLook(theme);
  return { label, id: isArtLook(id) ? id : null };
});
// With a shape set only the corners resize.
const cropLocked = computed(() => wb.cropShape.value !== "free");
const baseSize = computed(() => (wb.image.value ? { width: wb.image.value.naturalWidth, height: wb.image.value.naturalHeight } : null));

onMounted(() => void wb.open());
onBeforeUnmount(wb.dispose);
onClickOutside(saveMenuRoot, () => (saveMenu.value = false));

const TITLES = {
  crop: "Crop",
  edges: "Edges",
  grade: "Colour grading",
  vignette: "Vignette",
  texture: "Texture",
  wash: "Paper wash",
  focus: "Focus",
  brush: "Brush",
  smudge: "Smudge",
  eraser: "Eraser",
  picker: "Pick colour",
} as const satisfies Record<WorkbenchTool, string>;
const freshSeed = () => Math.floor(Math.random() * 1e9);
const toolTitle = computed(() => TITLES[wb.tool.value]);
const cursorClass = computed(() => (wb.tool.value === "focus" && wb.dofEnabled.value ? "cursor-crosshair" : ""));

// ── Painting panels ─────────────────────────────────────────────────────────
const PAINT_TABS = [
  { id: "brushes", label: "Brushes" },
  { id: "layers", label: "Layers" },
  { id: "colour", label: "Colour" },
] as const;
type PaintTab = (typeof PAINT_TABS)[number]["id"];
const paintTab = ref<PaintTab>("brushes");
/** The two full-panel views reached from the options bar and the status line. */
const paintView = ref<"tabs" | "settings" | "pen">("tabs");
const armedPaintTool = computed(() => (isPaintTool(wb.tool.value) ? wb.tool.value : null));

const openColourTab = () => {
  paintTab.value = "colour";
  paintView.value = "tabs";
  if (!armedPaintTool.value) wb.tool.value = "brush";
};
const openBrushes = () => {
  paintTab.value = "brushes";
  paintView.value = "tabs";
};
/** A brush picked while the colour picker is armed arms the Brush: the picker has none of its own. */
function onSelectBrush(id: string) {
  if (wb.tool.value === "picker") {
    wb.tool.value = "brush";
    paint.setTool("brush");
  }
  paint.selectBrush(id);
}
function onNewBrush() {
  if (paint.saveAsNewBrush()) paintView.value = "settings";
}

const tipPixels = computed(() => {
  const brush = paint.brush.value;
  return brush ? renderTipPreview(brush, paint.assets, { width: 64, height: 40, colour: PREVIEW_INK }) : null;
});
const penPressure = computed(() => (paint.pen.value?.reported.pressure ? paint.pen.value.pressure.toFixed(2) : "not reported"));
const penTilt = computed(() => (paint.pen.value?.reported.tilt ? `${paint.pen.value.tilt}°` : "not reported"));

function pick(action: () => Promise<void>) {
  saveMenu.value = false;
  void action();
}

function onPreset(values: ColourGradingOptions) {
  Object.assign(wb.grading, values);
  wb.gradingEnabled.value = true;
}

/** Torn paper's sliders move every side that is torn. */
function onPaperSlider(key: "roughness" | "depth" | "fibres" | "shadow", value: number) {
  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (wb.paper[side].enabled) wb.paper[side][key] = value;
  }
}

function onClassicSlider(side: PaperSide, key: keyof EdgeOptions, value: number) {
  if (key !== "enabled") wb.classic[side][key] = value;
}

function onTextureFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void wb.pickTexture(file);
  input.value = "";
}
function onTextureDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0];
  if (file) void wb.pickTexture(file);
}

async function done() {
  if (finishing.value) return;
  finishing.value = true;
  try {
    const recipe = await wb.finish();
    // A painting saved here is a canvas on the plan from now on.
    void invalidateQuota("paint_canvases");
    emit("done", recipe);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save your edits.");
  } finally {
    finishing.value = false;
  }
}

async function flatten() {
  const original = await wb.flatten();
  if (original === null) return;
  void invalidateQuota("paint_canvases");
  emit("flatten", original);
}
</script>
