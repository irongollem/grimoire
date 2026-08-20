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
    <AppInput
      v-if="components.includes('M')"
      :model-value="material"
      tone="filled"
      size="body"
      placeholder="Material component (e.g. a pinch of sulfur and powdered iron)…"
      @update:model-value="emit('update:material', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";
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
