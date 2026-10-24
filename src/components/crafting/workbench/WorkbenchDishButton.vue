<template>
  <!--
    A raw button on purpose: a dish is an illustrated object (a dish with its material), not a
    control recipe, so AppButton's chrome would be wrong. The visible focus ring is an ink ring
    with a paper gap, which reads on dark wood and on paper alike.
  -->
  <button
    ref="el"
    type="button"
    class="wb-slot group text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    :class="variant === 'bench' ? 'flex w-(--dish-w) flex-col items-center gap-2 rounded-md' : 'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-2 text-foreground'"
    :aria-label="label"
    :aria-haspopup="hasPopup ? 'dialog' : undefined"
    @click="onPress"
  >
    <!-- Phone rows stand the dish on the lower part of the bench picture. -->
    <span
      v-if="variant === 'row'"
      class="wb-well relative flex shrink-0 items-end justify-center overflow-hidden rounded-md"
      :style="{ '--dish-w': '5.5rem', backgroundImage: `url(${art.phoneSrc})` }"
    >
      <WorkbenchDish v-bind="dishProps" class="mb-1" />
    </span>
    <WorkbenchDish v-else v-bind="dishProps" />

    <span
      class="min-w-0"
      :class="variant === 'bench' ? 'w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-foreground shadow-md' : 'flex-1'"
    >
      <slot />
    </span>

    <slot name="trailing" />
  </button>
</template>

<script setup lang="ts">
import { ref } from "vue";
import WorkbenchDish from "@/components/crafting/workbench/WorkbenchDish.vue";
import type { BenchArt } from "@/lib/crafting/workbench/art";

const { variant, art, dishProps, label, hasPopup = false } = defineProps<{
  variant: "bench" | "row";
  art: BenchArt;
  /** Exactly what the dish takes, built by the caller from its own state. */
  dishProps: InstanceType<typeof WorkbenchDish>["$props"];
  /** The accessible name. */
  label: string;
  hasPopup?: boolean;
}>();

const emit = defineEmits<{ press: [el: HTMLElement] }>();

function onPress() {
  if (el.value) emit("press", el.value);
}

const el = ref<HTMLButtonElement | null>(null);
defineExpose({ focus: () => el.value?.focus() });
</script>

<style scoped>
.wb-well {
  width: 6.5rem;
  aspect-ratio: 1 / 0.8;
  /* Zoomed so only the bench top fills the well: with `cover` a 3:2 picture in a near-square box
     shows its whole height, apparatus and all. */
  background-size: 260% auto;
  background-position: center 88%;
}
</style>
