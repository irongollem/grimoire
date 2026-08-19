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
        :class="enabled ? 'text-foreground' : 'text-muted-foreground'"
      >Depth of Field</span>
      <button
        type="button"
        class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        :class="enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
        @click.stop="emit('update:enabled', !enabled)"
      >
        <span
          class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
          :class="enabled ? 'translate-x-4.5' : 'translate-x-0.5'"
        />
      </button>
    </div>

    <div
      v-show="open"
      class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
      :class="enabled ? 'opacity-100' : 'opacity-35'"
    >
      <p v-if="enabled && hasImage" class="text-caption text-muted-foreground italic">
        Click the image to set the focal point
      </p>

      <!-- Falloff curve pills -->
      <div class="flex items-center gap-1.5">
        <span class="text-eyebrow text-muted-foreground mr-1">Falloff</span>
        <AppButton
          v-for="curve in (['linear', 'quadratic', 'cubic'] as FalloffCurve[])"
          :key="curve"
          variant="subtle"
          size="xs"
          :active="dof.falloff === curve"
          :label="curve"
          @click="emit('set-falloff', curve)"
        />
      </div>

      <!-- Focus radius -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">Focus radius</label>
          <span class="text-caption text-muted-foreground tabular-nums">{{ Math.round(dof.focusRadius * 100) }}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="dof.focusRadius"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'focusRadius', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>

      <!-- Blur strength -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">Blur</label>
          <span class="text-caption text-muted-foreground tabular-nums">{{ Math.round(dof.blurStrength * 100) }}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="dof.blurStrength"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'blurStrength', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>

      <!-- Desaturation -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">Desaturation</label>
          <span class="text-caption text-muted-foreground tabular-nums">{{ Math.round(dof.desaturation * 100) }}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="dof.desaturation"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'desaturation', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronRight } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import type { DofBlurOptions, FalloffCurve } from "@/lib/illuminate/dofBlur";

type DofNumericField = "focusRadius" | "blurStrength" | "desaturation";

const {
  dof,
  enabled,
  open,
  hasImage,
} = defineProps<{
  dof: DofBlurOptions;
  enabled: boolean;
  open: boolean;
  hasImage: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "update:enabled": [value: boolean];
  "set-falloff": [curve: FalloffCurve];
  "set-field": [key: DofNumericField, value: number];
}>();
</script>
