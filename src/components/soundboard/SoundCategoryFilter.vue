<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="px-3 py-1 rounded-full text-xs font-cinzel tracking-wide border transition-colors"
      :class="
        modelValue === opt.value
          ? 'bg-gold-500/20 border-gold-500/60 text-gold-300'
          : 'bg-transparent border-border text-muted-foreground hover:text-foreground hover:border-border/80'
      "
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import type { SoundCategory } from "@/types/sound.types";

defineProps<{
  modelValue: SoundCategory | "all";
}>();

defineEmits<{
  (e: "update:modelValue", val: SoundCategory | "all"): void;
}>();

const options: { label: string; value: SoundCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Ambient", value: "ambient" },
  { label: "Music", value: "music" },
  { label: "Effects", value: "effects" },
  { label: "Misc", value: "misc" },
];
</script>
