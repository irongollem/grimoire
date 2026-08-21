<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <h3
      class="text-label-lg font-bold text-muted-foreground uppercase mb-3"
    >
      Spell Lists
    </h3>
    <p class="text-caption text-muted-foreground italic mb-3">
      Which classes have access to this spell?
    </p>
    <div class="flex flex-col gap-2">
      <AppCheckbox
        v-for="cls in SPELL_CLASSES"
        :key="cls"
        v-model="classesModel"
        :value="cls"
        :label="cls"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import { SPELL_CLASSES } from "@/types/spell.types";

const { classes } = defineProps<{
  classes: string[];
}>();

const emit = defineEmits<{
  "update:classes": [value: string[]];
}>();

// AppCheckbox's array-group binding needs a writable v-model; `classes` is a
// prop paired with an `update:classes` emit rather than a local ref, so
// bridge the two through a computed (same pattern as SpellTimingSection).
const classesModel = computed<string[]>({
  get: () => classes,
  set: (value) => emit("update:classes", value),
});
</script>
