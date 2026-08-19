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
      >Vignette</span>
      <ToggleSwitch
        :model-value="enabled"
        aria-label="Toggle vignette"
        @update:model-value="emit('update:enabled', $event)"
        @click.stop
      />
    </div>

    <div
      v-show="open"
      class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
      :class="enabled ? 'opacity-100' : 'opacity-35'"
    >
      <!-- Mode pill buttons -->
      <div class="flex items-center gap-1.5">
        <span class="text-eyebrow text-muted-foreground mr-1">Mode</span>
        <AppButton
          v-for="m in (['transparent', 'colour'] as VignetteMode[])"
          :key="m"
          variant="subtle"
          size="xs"
          :active="vignette.mode === m"
          :label="m"
          @click="emit('set-mode', m)"
        />
      </div>

      <!-- Colour picker — only in colour mode -->
      <div v-if="vignette.mode === 'colour'" class="flex items-center gap-2">
        <span class="text-eyebrow text-muted-foreground">Colour</span>
        <input
          type="color"
          :value="vignette.colour"
          class="h-6 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
          @input="(e) => emit('set-colour', (e.target as HTMLInputElement).value)"
        />
        <span class="text-caption text-muted-foreground">{{ vignette.colour }}</span>
      </div>

      <!-- Strength slider -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">Strength</label>
          <span class="text-caption text-muted-foreground tabular-nums">{{ Math.round(vignette.strength * 100) }}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="vignette.strength"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'strength', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>

      <!-- Softness slider -->
      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-eyebrow text-muted-foreground">Softness</label>
          <span class="text-caption text-muted-foreground tabular-nums">{{ Math.round(vignette.softness * 100) }}</span>
        </div>
        <input
          type="range" min="0" max="1" step="0.01"
          :value="vignette.softness"
          class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
          @input="(e) => emit('set-field', 'softness', parseFloat((e.target as HTMLInputElement).value))"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronRight } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import type { VignetteOptions, VignetteMode } from "@/lib/illuminate/vignette";

type VignetteNumericField = "strength" | "softness";

const {
  vignette,
  enabled,
  open,
} = defineProps<{
  vignette: VignetteOptions;
  enabled: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
  "update:enabled": [value: boolean];
  "set-mode": [mode: VignetteMode];
  "set-colour": [colour: string];
  "set-field": [key: VignetteNumericField, value: number];
}>();
</script>
