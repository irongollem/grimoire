<template>
  <!-- Settings panel -->
  <div class="rounded-lg border border-border bg-card p-4 flex flex-col gap-4">

    <!-- Ring color -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Ring Colour</p>
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
        <span class="font-cinzel text-[10px] text-muted-foreground tracking-wider ml-1">{{ ringColor.toUpperCase() }}</span>
      </div>
    </div>

    <!-- Ring width -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Ring Width</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="w in RING_WIDTHS"
          :key="w.label"
          type="button"
          class="px-3 py-1.5 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
          :class="ringWidth === w.value
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:ringWidth', w.value)"
        >{{ w.label }}</button>
      </div>
    </div>

    <!-- Name label toggle -->
    <div class="flex items-center justify-between">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Name Label</p>
      <button
        type="button"
        class="inline-flex items-center gap-2 font-cinzel text-xs tracking-wider transition-colors"
        :class="showName ? 'text-primary' : 'text-muted-foreground'"
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
      </button>
    </div>

    <!-- Export size -->
    <div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-2">Export Size</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in EXPORT_SIZES"
          :key="s.value"
          type="button"
          class="px-3 py-1.5 rounded-md font-cinzel text-[11px] font-semibold tracking-wider border transition-colors"
          :class="exportSize === s.value
            ? 'bg-primary/15 text-primary border-primary/40'
            : 'text-muted-foreground border-border hover:border-foreground/30'"
          @click="emit('update:exportSize', s.value)"
        >{{ s.label }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
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
</script>
