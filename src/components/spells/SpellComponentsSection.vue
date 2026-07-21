<template>
  <div class="flex flex-col gap-2">
    <span class="text-label-lg text-muted-foreground uppercase"
      >Components</span
    >
    <div class="flex items-center gap-4">
      <label
        v-for="c in SPELL_COMPONENTS"
        :key="c"
        class="flex items-center gap-1.5 cursor-pointer"
      >
        <input type="checkbox" :value="c" :checked="components.includes(c)" class="rounded" @change="toggleComponent(c)" />
        <span class="font-cinzel text-sm font-semibold text-foreground">{{ c }}</span>
      </label>
    </div>
    <input
      v-if="components.includes('M')"
      :value="material"
      placeholder="Material component (e.g. a pinch of sulfur and powdered iron)…"
      class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @input="$emit('update:material', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
import { SPELL_COMPONENTS } from "@/types/spell.types";

const { components, material } = defineProps<{
  components: string[];
  material: string;
}>();

const emit = defineEmits<{
  "update:components": [value: string[]];
  "update:material": [value: string];
}>();

function toggleComponent(c: string) {
  const next = components.includes(c)
    ? components.filter((x) => x !== c)
    : [...components, c];
  emit("update:components", next);
}
</script>
