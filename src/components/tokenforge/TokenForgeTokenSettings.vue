<template>
  <!-- Settings panel -->
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">

    <!-- Ring color -->
    <div>
      <p class="text-label-lg font-semibold text-muted-foreground mb-2">Ring Colour</p>
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="preset in RING_PRESETS"
          :key="preset.label"
          type="button"
          :title="preset.label"
          class="h-7 w-7 rounded-full transition-transform hover:scale-110 border-2"
          :style="{
            backgroundColor: preset.color,
            borderColor: ringColor === preset.color ? 'white' : 'transparent',
            boxShadow: ringColor === preset.color ? `0 0 0 3px ${preset.color}60` : 'none',
          }"
          @click="emit('update:ringColor', preset.color)"
        />
        <!-- Custom colour picker -->
        <label
          class="h-7 w-7 rounded-full border-2 border-border cursor-pointer overflow-hidden hover:scale-110 transition-transform"
          title="Custom colour"
          style="background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"
        >
          <input
            type="color"
            :value="ringColor"
            class="sr-only"
            @input="emit('update:ringColor', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <span class="text-label text-muted-foreground ml-1">{{ ringColor.toUpperCase() }}</span>
      </div>
    </div>

    <!-- Ring width -->
    <div>
      <p class="text-label-lg font-semibold text-muted-foreground mb-2">Ring Width</p>
      <SegmentedControl v-model="ringWidthModel" :options="RING_WIDTHS" size="sm" wrap gap="loose" />
    </div>

    <!-- Name label toggle -->
    <div class="flex items-center justify-between">
      <p class="text-label-lg font-semibold text-muted-foreground">Name Label</p>
      <AppButton
        variant="ghost"
        size="inline"
        :active="showName"
        active-fill="none"
        class="gap-2"
        @click="emit('update:showName', !showName)"
      >
        <div
          class="h-5 w-8 rounded-full transition-colors flex items-center px-0.5"
          :class="showName ? 'bg-primary' : 'bg-muted'"
        >
          <div
            class="h-4 w-4 rounded-full bg-white shadow transition-transform"
            :class="showName ? 'translate-x-3' : 'translate-x-0'"
          />
        </div>
        {{ showName ? 'On' : 'Off' }}
      </AppButton>
    </div>

    <!-- Export size -->
    <div>
      <p class="text-label-lg font-semibold text-muted-foreground mb-2">Export Size</p>
      <SegmentedControl v-model="exportSizeModel" :options="EXPORT_SIZES" size="sm" wrap gap="loose" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";

const RING_PRESETS = [
  { label: "Party",   color: "#3b82f6" },
  { label: "Ally",    color: "#ca8a04" },
  { label: "Enemy",   color: "#dc2626" },
  { label: "Neutral", color: "#6b7280" },
  { label: "Boss",    color: "#7c3aed" },
  { label: "Nature",  color: "#16a34a" },
];

const RING_WIDTHS = [
  { label: "Thin",   value: 8  },
  { label: "Medium", value: 20 },
  { label: "Thick",  value: 34 },
  { label: "Heavy",  value: 52 },
];

const EXPORT_SIZES = [
  { label: "280px · Roll20 1×1",  value: 280 },
  { label: "512px · HD / Large",  value: 512 },
];

const { ringColor, ringWidth, showName, exportSize } = defineProps<{
  ringColor: string;
  ringWidth: number;
  showName: boolean;
  exportSize: number;
}>();

const emit = defineEmits<{
  (e: 'update:ringColor', value: string): void;
  (e: 'update:ringWidth', value: number): void;
  (e: 'update:showName', value: boolean): void;
  (e: 'update:exportSize', value: number): void;
}>();

const ringWidthModel = computed<number>({
  get: () => ringWidth,
  set: (value) => emit('update:ringWidth', value),
});

const exportSizeModel = computed<number>({
  get: () => exportSize,
  set: (value) => emit('update:exportSize', value),
});
</script>
