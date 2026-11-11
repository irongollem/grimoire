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
        <IlluminateToolRail v-model:tool="wb.tool.value" />

        <IlluminateStage
          ref="stage"
          v-model:compare-pos="wb.comparePos.value"
          :size="wb.previewSize.value"
          :show-original="wb.showOriginal.value"
          :compare-off="wb.tool.value === 'brush' || wb.tool.value === 'focus'"
          :cursor-class="cursorClass"
          :load-error="wb.loadError.value"
          :brush-cursor="wb.brushCursor"
          @canvas-click="wb.onCanvasClick"
          @brush-down="wb.onBrushDown"
          @brush-move="wb.onBrushMove"
          @brush-up="wb.onBrushUp"
          @brush-enter="wb.brushCursor.visible = wb.tool.value === 'brush'"
          @brush-leave="wb.brushCursor.visible = false"
        />

        <aside :aria-label="toolTitle" class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
          <div class="flex flex-col gap-0.5 px-4 pt-4">
            <span class="text-eyebrow uppercase text-muted-foreground">Tool</span>
            <span class="font-heading text-heading-sm">{{ toolTitle }}</span>
          </div>

          <IlluminateEdgesTool
            v-if="wb.tool.value === 'edges'"
            :edge-style="wb.edgeStyle.value"
            :classic="wb.classic"
            :paper="wb.paper"
            @style-change="wb.setEdgeStyle"
            @side="wb.setEdgeSideEnabled"
            @paper-slider="onPaperSlider"
            @classic-slider="onClassicSlider"
          />

          <IlluminateColorGradingPanel
            v-else-if="wb.tool.value === 'colour'"
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

          <IlluminateBrushPanel
            v-else
            :brush="wb.brush"
            :open="true"
            :has-strokes="wb.hasStrokes.value"
            @update:brush="Object.assign(wb.brush, $event)"
            @undo="wb.undoBrush"
            @clear="wb.clearBrush"
          />
          <input ref="textureInput" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="onTextureFile" />

          <div class="border-t border-border p-4">
            <AppButton variant="ghost" size="inline-xs" label="Reset all to defaults" :disabled="!wb.hasEdits.value" @click="wb.resetAll" />
          </div>

          <IlluminateAskSection
            :base-url="wb.baseUrl.value"
            :natural="baseSize"
            :document-id="documentId"
            :user-id="userId"
            :look="look"
            :has-ai-result="wb.aiStep.value !== null"
            @result="(url, action) => void wb.setAiResult(url, action)"
            @use-original="wb.clearAiResult"
          />
        </aside>
      </div>
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
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import IlluminateBrushPanel from "@/scriptorium/illuminator/components/IlluminateBrushPanel.vue";
import IlluminateAskSection from "@/scriptorium/illuminator/components/IlluminateAskSection.vue";
import IlluminateColorGradingPanel from "@/scriptorium/illuminator/components/IlluminateColorGradingPanel.vue";
import IlluminateDofPanel from "@/scriptorium/illuminator/components/IlluminateDofPanel.vue";
import IlluminateEdgesTool from "@/scriptorium/illuminator/components/IlluminateEdgesTool.vue";
import IlluminateStage from "@/scriptorium/illuminator/components/IlluminateStage.vue";
import IlluminateTexturePanel from "@/scriptorium/illuminator/components/IlluminateTexturePanel.vue";
import IlluminateToolRail from "@/scriptorium/illuminator/components/IlluminateToolRail.vue";
import IlluminateVignettePanel from "@/scriptorium/illuminator/components/IlluminateVignettePanel.vue";
import { DEFAULT_COLOUR_GRADING, type ColourGradingOptions } from "@/scriptorium/illuminator/lib/colourGrading";
import type { EdgeOptions } from "@/scriptorium/illuminator/lib/edgeTreatment";
import type { PaperSide } from "@/scriptorium/illuminator/lib/tornPaper";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { isArtLook } from "@edge-shared/scriptoriumLookStyles.ts";
import { useScriptoriumDocument } from "@/scriptorium/composables/useScriptorium";
import { scriptoriumLook } from "@/scriptorium/lib/looks";
import { useIlluminateWorkbench } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { useToast } from "@/composables/useToast";
import { IconCheck, IconClipboard, IconDownload, IconImage, IconSave } from "@/lib/icons";

const { original, settings, name, pageLabel, userId } = defineProps<{
  /** The untouched picture the recipe applies to. */
  original: string;
  /** The recipe it has now, or null for a picture with no edits. */
  settings: IlluminateSettings | null;
  /** What the picture is called in the title. */
  name: string;
  /** "page 3": where Done goes back to. */
  pageLabel: string;
  userId: string | undefined;
}>();

const emit = defineEmits<{
  done: [settings: IlluminateSettings];
  cancel: [];
}>();

const toast = useToast();
const stage = ref<InstanceType<typeof IlluminateStage> | null>(null);
const textureInput = ref<HTMLInputElement | null>(null);
const saveMenu = ref(false);
const saveMenuRoot = ref<HTMLElement | null>(null);
const finishing = ref(false);

const wb = useIlluminateWorkbench({
  original: () => original,
  settings: () => settings,
  userId: () => userId,
  canvases: () => ({ before: stage.value?.beforeEl ?? null, after: stage.value?.afterEl ?? null }),
});

// The AI actions are paid for against a document the server checks belongs to the caller. The workbench only
// opens inside a document's editor, whose route names it.
const route = useRoute();
const documentId = computed(() => String(route.params.id));
const { data: bookDoc } = useScriptoriumDocument(documentId);
const look = computed(() => {
  if (!bookDoc.value) return null;
  const { id, label } = scriptoriumLook(bookDoc.value.theme);
  return { label, id: isArtLook(id) ? id : null };
});
const baseSize = computed(() => (wb.image.value ? { width: wb.image.value.naturalWidth, height: wb.image.value.naturalHeight } : null));

onMounted(() => void wb.open());
onBeforeUnmount(wb.dispose);
onClickOutside(saveMenuRoot, () => (saveMenu.value = false));

const TITLES = { edges: "Edges", colour: "Colour", vignette: "Vignette", texture: "Texture", focus: "Focus", brush: "Brush" } as const;
const toolTitle = computed(() => TITLES[wb.tool.value]);
const cursorClass = computed(() => {
  if (wb.tool.value === "brush") return "cursor-none";
  if (wb.tool.value === "focus" && wb.dofEnabled.value) return "cursor-crosshair";
  return "";
});

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
    emit("done", await wb.finish());
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save your edits.");
  } finally {
    finishing.value = false;
  }
}
</script>
