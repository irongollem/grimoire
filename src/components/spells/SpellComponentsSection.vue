<template>
  <div class="flex flex-col gap-2">
    <span class="text-label-lg text-muted-foreground uppercase"
      >Components</span
    >
    <div class="flex items-center gap-4">
      <AppCheckbox
        v-for="c in SPELL_COMPONENTS"
        :key="c"
        v-model="componentsModel"
        :value="c"
        :label="c"
      />
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
import { computed } from "vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
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

// AppCheckbox's array-group binding needs a writable v-model; `components` is
// a prop paired with an `update:components` emit rather than a local ref, so
// bridge the two through a computed (same pattern as SpellTimingSection).
const componentsModel = computed<string[]>({
  get: () => components,
  set: (value) => emit("update:components", value),
});
</script>
