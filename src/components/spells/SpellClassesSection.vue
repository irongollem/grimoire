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
      <label
        v-for="cls in SPELL_CLASSES"
        :key="cls"
        class="flex items-center gap-2 cursor-pointer"
      >
        <input
          type="checkbox"
          :value="cls"
          :checked="classes.includes(cls)"
          class="rounded"
          @change="toggleClass(cls)"
        />
        <span class="text-body text-foreground">{{ cls }}</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SPELL_CLASSES } from "@/types/spell.types";

const { classes } = defineProps<{
  classes: string[];
}>();

const emit = defineEmits<{
  "update:classes": [value: string[]];
}>();

function toggleClass(cls: string) {
  const next = classes.includes(cls)
    ? classes.filter((x) => x !== cls)
    : [...classes, cls];
  emit("update:classes", next);
}
</script>
