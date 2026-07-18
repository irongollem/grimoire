<template>
  <div class="space-y-4">
    <p class="font-fell text-sm text-muted-foreground italic">
      Choose how this miniature will be made — the format decides the stylized render, the mesh
      parameters, and which files you'll be able to download.
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        v-for="opt in FORMAT_OPTIONS"
        :key="opt.value"
        type="button"
        class="flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors"
        :class="modelValue === opt.value
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 hover:bg-secondary/40'"
        @click="emit('update:modelValue', opt.value)"
      >
        <div class="flex items-center justify-between">
          <span class="font-cinzel text-sm font-semibold tracking-wide text-foreground">{{ opt.label }}</span>
          <span
            v-if="modelValue === opt.value"
            class="rounded-full bg-primary px-1.5 py-0.5 font-cinzel text-2xs font-semibold tracking-wider text-primary-foreground"
          >Selected</span>
        </div>
        <p class="font-fell text-xs text-muted-foreground">{{ opt.tagline }}</p>
        <ul class="font-fell text-2xs text-muted-foreground/80 space-y-0.5 list-disc list-inside">
          <li v-for="detail in opt.details" :key="detail">{{ detail }}</li>
        </ul>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MiniFormat } from "@/types/mini.types";

defineProps<{ modelValue: MiniFormat | null }>();
const emit = defineEmits<{ "update:modelValue": [MiniFormat] }>();

const FORMAT_OPTIONS: {
  value: MiniFormat;
  label: string;
  tagline: string;
  details: string[];
}[] = [
  {
    value: "print",
    label: "Print",
    tagline: "Unpainted grey resin, ready for a 3D printer.",
    details: [
      "High-poly STL, GLB & 3MF",
      "Single connected body with an integral base",
      "You paint it yourself once it's printed",
    ],
  },
  {
    value: "vtt",
    label: "VTT",
    tagline: "Full-color, low-poly render for virtual tabletops.",
    details: [
      "Textured GLB & USDZ",
      "Simplified clean silhouette with an integral base",
      "Drop straight into your VTT of choice",
    ],
  },
];
</script>
