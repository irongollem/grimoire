<template>
  <!-- The kind's icon, and for a scene or playlist its size in a bubble on the
       icon's top-right quarter: shorter than "3 layers", and it never truncates. -->
  <span class="relative inline-flex shrink-0" :title="title" aria-hidden="true">
    <component :is="SOUND_KIND_ICON[kind]" :class="iconClass" />
    <span
      v-if="count !== null"
      class="absolute -end-1.5 -top-1.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-current px-0.5"
      data-kind-count
    >
      <span class="text-[0.5625rem] leading-none font-bold tabular-nums" :class="countClass">{{ count }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { SOUND_KIND_ICON, SOUND_KIND_LABEL, type SoundKind } from "@/lib/audio/soundKinds";

const {
  kind,
  count = null,
  iconClass = "h-4 w-4",
  countClass = "text-card",
} = defineProps<{
  kind: SoundKind;
  /** Layers or tracks; null hides the bubble. */
  count?: number | null;
  iconClass?: string;
  /** The number's colour, set against the bubble, which is the icon's own colour. */
  countClass?: string;
}>();

const title = computed(() => {
  const label = SOUND_KIND_LABEL[kind];
  if (count === null) return label;
  const noun = kind === "scene" ? "layer" : "track";
  return `${label}, ${count} ${noun}${count === 1 ? "" : "s"}`;
});
</script>
