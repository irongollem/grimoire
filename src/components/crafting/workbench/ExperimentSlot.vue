<template>
  <!-- Filled, the dish holds the laid-out item and a press takes it back; empty, it waits for one. -->
  <WorkbenchDishButton ref="button" :variant="variant" :art="art" :dish-props="dishProps" :label="label" @press="emit('press')">
    <template v-if="entry">
      <span class="block truncate text-label-lg font-semibold text-foreground">{{ entry.name }}</span>
      <span class="block truncate text-caption text-muted-foreground">Tap to take it back</span>
    </template>
    <template v-else>
      <span class="block truncate text-label-lg font-semibold text-muted-foreground">Add from your pack</span>
    </template>
  </WorkbenchDishButton>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import WorkbenchDishButton from "@/components/crafting/workbench/WorkbenchDishButton.vue";
import { WORKBENCH_SPRITES } from "@/data/workbenchArt";
import type { ExperimentEntry } from "@/lib/crafting/experiment";
import { spriteSrc, type BenchArt } from "@/lib/crafting/workbench/art";

const { entry, index, total, variant, art } = defineProps<{
  /** What is laid in the dish; null for the empty dish waiting to be filled. */
  entry: ExperimentEntry | null;
  index: number;
  total: number;
  variant: "bench" | "row";
  art: BenchArt;
}>();

const emit = defineEmits<{ press: [] }>();

const button = ref<InstanceType<typeof WorkbenchDishButton> | null>(null);
defineExpose({ focus: () => button.value?.focus() });

const dishProps = computed(() => ({
  dishSrc: art.dishSrc,
  dish: art.dish,
  spriteSrc: entry ? spriteSrc(entry.sprite.sprite) : null,
  sprite: entry ? WORKBENCH_SPRITES[entry.sprite.sprite] : null,
  filter: entry ? entry.sprite.filter : null,
  // The empty dish shows only the opening outline.
  state: entry ? ("ready" as const) : ("missing" as const),
  order: index,
}));

const label = computed(() =>
  entry
    ? `Dish ${index + 1} of ${total}: ${entry.name}. Press to take it back.`
    : `Dish ${index + 1} of ${total}: empty. Add from your pack.`,
);
</script>
