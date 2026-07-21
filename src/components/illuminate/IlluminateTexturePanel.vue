<template>
  <div class="border-t border-border">
    <div
      class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
      @click="emit('toggle')"
    >
      <IconChevronRight
        class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
        :class="open ? 'rotate-90' : ''"
      />
      <span
        class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
        :class="enabled && hasImage ? 'text-foreground' : 'text-muted-foreground'"
      >Texture Overlay</span>
      <button
        type="button"
        class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        :class="enabled && hasImage ? 'bg-primary' : 'bg-muted-foreground/30'"
        @click.stop="emit('update:enabled', !enabled)"
      >
        <span
          class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
          :class="enabled && hasImage ? 'translate-x-4.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div
      v-show="open"
      class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
      :class="enabled && hasImage ? 'opacity-100' : 'opacity-35'"
    >
      <!-- Texture upload -->
      <div
        v-if="!hasImage"
        class="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-3 cursor-pointer hover:border-primary/50 transition-colors"
        @click="emit('pick-file')"
        @dragover.prevent
        @drop.prevent="(e: DragEvent) => emit('drop-file', e)"
      >
        <span class="font-fell text-xs text-muted-foreground">Drop texture or click to upload</span>
      </div>
      <div v-else class="flex items-center gap-2">
        <span class="font-fell text-xs text-muted-foreground truncate flex-1">{{ filename }}</span>
        <button
          type="button"
          class="font-cinzel text-2xs tracking-wider text-muted-foreground hover:text-foreground transition-colors shrink-0"
          @click="emit('clear')"
        >Remove</button>
      </div>

      <!-- Blend mode pills -->
      <div class="flex items-center gap-1.5 flex-wrap">
        <span class="font-cinzel text-2xs tracking-wider text-muted-foreground uppercase mr-1">Blend</span>
        <button
          v-for="mode in BLEND_MODES"
          :key="mode"
          type="button"
          class="font-cinzel text-2xs tracking-wider px-2 py-0.5 rounded border transition-colors"
          :class="texture.blendMode === mode
            ? 'border-primary text-primary'
            : 'border-border hover:border-primary/60 hover:text-foreground text-muted-foreground'"
          @click="emit('set-blend-mode', mode)"
        >{{ BLEND_MODE_LABELS[mode] }}</button>
      </div>

      <!-- Opacity slider -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="font-cinzel text-2xs tracking-wider text-muted-foreground uppercase">Opacity</label>
          <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(texture.opacity * 100) }}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="texture.opacity"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'opacity', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>

      <!-- Scale slider -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="font-cinzel text-2xs tracking-wider text-muted-foreground uppercase">Tile scale</label>
          <span class="font-fell text-xs text-muted-foreground tabular-nums">×{{ texture.scale.toFixed(2) }}</span>
        </div>
        <input
          type="range" min="0.1" max="3" step="0.05"
          :value="texture.scale"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'scale', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronRight } from "@/lib/icons";
import {
  BLEND_MODES,
  BLEND_MODE_LABELS,
  type TextureBlendMode,
  type TextureOverlayOptions,
} from "@/lib/textureOverlay";

type TextureState = Omit<TextureOverlayOptions, "enabled">;
type TextureNumericField = "opacity" | "scale";

const {
  texture,
  enabled,
  open,
  hasImage,
  filename,
} = defineProps<{
  texture: TextureState;
  enabled: boolean;
  open: boolean;
  hasImage: boolean;
  filename: string;
}>();

const emit = defineEmits<{
  toggle: [];
  "update:enabled": [value: boolean];
  "pick-file": [];
  "drop-file": [event: DragEvent];
  clear: [];
  "set-blend-mode": [mode: TextureBlendMode];
  "set-field": [key: TextureNumericField, value: number];
}>();
</script>
