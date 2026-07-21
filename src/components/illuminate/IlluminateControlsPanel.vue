<template>
  <div class="flex flex-col rounded-xl border border-border bg-card overflow-hidden lg:min-h-0 lg:overflow-y-auto">

    <!-- Mode toggle -->
    <div class="px-4 py-3 border-b border-border flex items-center gap-2">
      <span class="font-cinzel text-2xs tracking-wider text-muted-foreground uppercase mr-1">Mode</span>
      <button
        v-for="m in (['auto', 'brush'] as IlluminatorMode[])"
        :key="m"
        type="button"
        class="font-cinzel text-2xs tracking-wider px-3 py-1 rounded-full border transition-colors"
        :class="mode === m
          ? 'border-primary text-primary bg-primary/10'
          : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'"
        @click="emit('update:mode', m)"
      >{{ m === 'auto' ? 'Auto' : 'Brush' }}</button>
    </div>

    <!-- Brush section (brush mode only) -->
    <IlluminateBrushPanel
      v-if="mode === 'brush'"
      :brush="brush"
      :open="brushOpen"
      :has-strokes="hasStrokes"
      @toggle="emit('toggle-brush')"
      @update:brush="emit('update:brush', $event)"
      @undo="emit('brush-undo')"
      @clear="emit('brush-clear')"
    />

    <!-- Colour Grading section -->
    <IlluminateColorGradingPanel
      :grading="grading"
      :enabled="gradingEnabled"
      :open="gradingOpen"
      @toggle="emit('toggle-grading')"
      @update:enabled="emit('update:gradingEnabled', $event)"
      @set-slider="(key, value) => emit('grading-slider', key, value)"
      @apply-preset="(p) => emit('grading-preset', p)"
      @reset="emit('grading-reset')"
    />

    <!-- Vignette section -->
    <IlluminateVignettePanel
      :vignette="vignette"
      :enabled="vignetteEnabled"
      :open="vignetteOpen"
      @toggle="emit('toggle-vignette')"
      @update:enabled="emit('update:vignetteEnabled', $event)"
      @set-mode="emit('vignette-mode', $event)"
      @set-colour="emit('vignette-colour', $event)"
      @set-field="(key, value) => emit('vignette-field', key, value)"
    />

    <!-- Texture Overlay section -->
    <IlluminateTexturePanel
      :texture="texture"
      :enabled="textureEnabled"
      :open="textureOpen"
      :has-image="textureHasImage"
      :filename="textureFilename"
      @toggle="emit('toggle-texture')"
      @update:enabled="emit('update:textureEnabled', $event)"
      @pick-file="emit('texture-pick')"
      @drop-file="emit('texture-drop', $event)"
      @clear="emit('texture-clear')"
      @set-blend-mode="emit('texture-blend-mode', $event)"
      @set-field="(key, value) => emit('texture-field', key, value)"
    />
    <!-- Hidden file input for texture upload -->
    <slot name="texture-input" />

    <!-- Depth of Field section -->
    <IlluminateDofPanel
      :dof="dof"
      :enabled="dofEnabled"
      :open="dofOpen"
      :has-image="hasImage"
      @toggle="emit('toggle-dof')"
      @update:enabled="emit('update:dofEnabled', $event)"
      @set-falloff="emit('dof-falloff', $event)"
      @set-field="(key, value) => emit('dof-field', key, value)"
    />

    <!-- Edge Treatment section -->
    <IlluminateEdgePanel
      :opts="opts"
      :open="edgesOpen"
      :edge-open="edgeOpen"
      @toggle="emit('toggle-edges')"
      @toggle-edge="(edge) => emit('toggle-edge', edge)"
      @set-edge-enabled="(edge, value) => emit('edge-enabled', edge, value)"
      @set-slider="(edge, key, value) => emit('edge-slider', edge, key, value)"
    />

    <!-- Footer: reset + export -->
    <div class="border-t border-border p-4 flex flex-col gap-2">
      <button
        type="button"
        class="font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-foreground transition-colors text-right mb-1"
        @click="emit('reset')"
      >Reset all to defaults</button>

      <!-- Save to Scriptorium — only shown when launched from a document -->
      <button
        v-if="returnDocId"
        type="button"
        :disabled="!hasImage || isExporting"
        class="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground transition-opacity disabled:opacity-40"
        @click="emit('save-scriptorium')"
      >
        <IconLoadingAlt v-if="isSavingBack" class="h-3.5 w-3.5 shrink-0 animate-spin" />
        <IconSave v-else class="h-3.5 w-3.5 shrink-0" />
        {{ isSavingBack ? 'Saving…' : 'Save to Scriptorium' }}
      </button>

      <button
        type="button"
        :disabled="!hasImage || isExporting"
        class="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground transition-opacity disabled:opacity-40"
        @click="emit('download')"
      >
        <IconDownload class="h-3.5 w-3.5 shrink-0" />
        {{ isExporting ? 'Processing…' : 'Download PNG' }}
      </button>

      <button
        type="button"
        :disabled="!hasImage || isExporting || !clipboardSupported"
        class="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        @click="emit('copy')"
      >
        <component :is="copySuccess ? IconCheck : IconClipboard" class="h-3.5 w-3.5 shrink-0" />
        {{ copySuccess ? 'Copied!' : 'Copy to clipboard' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconCheck, IconClipboard, IconDownload, IconLoadingAlt, IconSave } from "@/lib/icons";
import IlluminateBrushPanel from "@/components/illuminate/IlluminateBrushPanel.vue";
import IlluminateColorGradingPanel from "@/components/illuminate/IlluminateColorGradingPanel.vue";
import IlluminateVignettePanel from "@/components/illuminate/IlluminateVignettePanel.vue";
import IlluminateTexturePanel from "@/components/illuminate/IlluminateTexturePanel.vue";
import IlluminateDofPanel from "@/components/illuminate/IlluminateDofPanel.vue";
import IlluminateEdgePanel from "@/components/illuminate/IlluminateEdgePanel.vue";
import type { ColourGradingOptions } from "@/lib/colourGrading";
import type { EdgeTreatmentOptions, EdgeOptions } from "@/lib/edgeTreatment";
import type { VignetteOptions } from "@/lib/vignette";
import type { DofBlurOptions, FalloffCurve } from "@/lib/dofBlur";
import type { TextureOverlayOptions } from "@/lib/textureOverlay";
import type { BrushState } from "@/lib/brushMask";

type IlluminatorMode = 'auto' | 'brush';

const {
  mode,
  hasImage,
  hasStrokes,
  brush,
  brushOpen,
  grading,
  gradingEnabled,
  gradingOpen,
  vignette,
  vignetteEnabled,
  vignetteOpen,
  texture,
  textureEnabled,
  textureOpen,
  textureHasImage,
  textureFilename,
  dof,
  dofEnabled,
  dofOpen,
  opts,
  edgesOpen,
  edgeOpen,
  returnDocId,
  isExporting,
  isSavingBack,
  clipboardSupported,
  copySuccess,
} = defineProps<{
  mode: IlluminatorMode;
  hasImage: boolean;
  hasStrokes: boolean;
  brush: BrushState;
  brushOpen: boolean;
  grading: ColourGradingOptions;
  gradingEnabled: boolean;
  gradingOpen: boolean;
  vignette: VignetteOptions;
  vignetteEnabled: boolean;
  vignetteOpen: boolean;
  texture: Omit<TextureOverlayOptions, 'enabled'>;
  textureEnabled: boolean;
  textureOpen: boolean;
  textureHasImage: boolean;
  textureFilename: string;
  dof: DofBlurOptions;
  dofEnabled: boolean;
  dofOpen: boolean;
  opts: EdgeTreatmentOptions;
  edgesOpen: boolean;
  edgeOpen: Record<string, boolean>;
  returnDocId: string | null;
  isExporting: boolean;
  isSavingBack: boolean;
  clipboardSupported: boolean;
  copySuccess: boolean;
}>();

const emit = defineEmits<{
  'update:mode': [value: IlluminatorMode];
  'toggle-brush': [];
  'update:brush': [value: Partial<BrushState>];
  'brush-undo': [];
  'brush-clear': [];
  'toggle-grading': [];
  'update:gradingEnabled': [value: boolean];
  'grading-slider': [key: keyof ColourGradingOptions, value: number];
  'grading-preset': [values: ColourGradingOptions];
  'grading-reset': [];
  'toggle-vignette': [];
  'update:vignetteEnabled': [value: boolean];
  'vignette-mode': [value: VignetteOptions['mode']];
  'vignette-colour': [value: string];
  'vignette-field': [key: keyof VignetteOptions, value: number];
  'toggle-texture': [];
  'update:textureEnabled': [value: boolean];
  'texture-pick': [];
  'texture-drop': [event: DragEvent];
  'texture-clear': [];
  'texture-blend-mode': [value: string];
  'texture-field': [key: keyof Omit<TextureOverlayOptions, 'enabled' | 'blendMode'>, value: number];
  'toggle-dof': [];
  'update:dofEnabled': [value: boolean];
  'dof-falloff': [value: FalloffCurve];
  'dof-field': [key: keyof DofBlurOptions, value: number];
  'toggle-edges': [];
  'toggle-edge': [edge: string];
  'edge-enabled': [edge: string, value: boolean];
  'edge-slider': [edge: string, key: keyof EdgeOptions, value: number];
  reset: [];
  'save-scriptorium': [];
  download: [];
  copy: [];
}>();
</script>
