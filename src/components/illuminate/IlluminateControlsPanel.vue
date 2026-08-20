<template>
  <div class="flex flex-col rounded-xl border border-border bg-card overflow-hidden lg:min-h-0 lg:overflow-y-auto">

    <!-- Mode toggle -->
    <div class="px-4 py-3 border-b border-border flex items-center gap-2">
      <span class="text-eyebrow text-muted-foreground mr-1">Mode</span>
      <AppButton
        v-for="m in (['auto', 'brush'] as IlluminatorMode[])"
        :key="m"
        variant="subtle"
        size="xs"
        shape="pill"
        :active="mode === m"
        :label="m === 'auto' ? 'Auto' : 'Brush'"
        @click="emit('update:mode', m)"
      />
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
      <AppButton
        variant="ghost"
        size="inline-xs"
        class="justify-end mb-1"
        label="Reset all to defaults"
        @click="emit('reset')"
      />

      <!-- Save to Scriptorium — only shown when launched from a document -->
      <AppButton
        v-if="returnDocId"
        variant="primary"
        size="md"
        :disabled="!hasImage || isExporting"
        :label="isSavingBack ? 'Saving…' : 'Save to Scriptorium'"
        @click="emit('save-scriptorium')"
      >
        <template #icon>
          <IconLoadingAlt v-if="isSavingBack" class="h-3.5 w-3.5 shrink-0 animate-spin" />
          <IconSave v-else class="h-3.5 w-3.5 shrink-0" />
        </template>
      </AppButton>

      <AppButton
        variant="primary"
        size="md"
        :disabled="!hasImage || isExporting"
        :icon="IconDownload"
        :label="isExporting ? 'Processing…' : 'Download PNG'"
        @click="emit('download')"
      />

      <AppButton
        variant="outline"
        fill="muted"
        size="md"
        :disabled="!hasImage || isExporting || !clipboardSupported"
        :icon="copySuccess ? IconCheck : IconClipboard"
        :label="copySuccess ? 'Copied!' : 'Copy to clipboard'"
        @click="emit('copy')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconCheck, IconClipboard, IconDownload, IconLoadingAlt, IconSave } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import IlluminateBrushPanel from "@/components/illuminate/IlluminateBrushPanel.vue";
import IlluminateColorGradingPanel from "@/components/illuminate/IlluminateColorGradingPanel.vue";
import IlluminateVignettePanel from "@/components/illuminate/IlluminateVignettePanel.vue";
import IlluminateTexturePanel from "@/components/illuminate/IlluminateTexturePanel.vue";
import IlluminateDofPanel from "@/components/illuminate/IlluminateDofPanel.vue";
import IlluminateEdgePanel from "@/components/illuminate/IlluminateEdgePanel.vue";
import type { ColourGradingOptions } from "@/lib/illuminate/colourGrading";
import type { EdgeTreatmentOptions, EdgeOptions } from "@/lib/illuminate/edgeTreatment";
import type { VignetteOptions } from "@/lib/illuminate/vignette";
import type { DofBlurOptions, FalloffCurve } from "@/lib/illuminate/dofBlur";
import type { TextureOverlayOptions } from "@/lib/illuminate/textureOverlay";
import type { BrushState } from "@/lib/illuminate/brushMask";

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
