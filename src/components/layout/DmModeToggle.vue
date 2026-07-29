<template>
  <!-- Prep/Play segmented control — the one shared implementation (sidebar,
       More sheet, wide bottom bar). In Play mode, visibility changes
       auto-broadcast to chat; in Prep mode they stay silent. -->
  <div
    class="flex w-full items-center overflow-hidden rounded border font-cinzel font-bold tracking-widest"
    :class="ui.dmMode === 'play' ? 'border-primary/50' : 'border-border'"
  >
    <button
      v-for="(seg, i) in segments"
      :key="seg.value"
      type="button"
      class="flex-1 text-center transition-colors"
      :class="[
        size === 'md' ? 'px-3 py-2 text-xs' : 'py-1 text-2xs',
        i > 0 ? (ui.dmMode === 'play' ? 'border-l border-primary/30' : 'border-l border-border') : '',
        ui.dmMode === seg.value
          ? seg.value === 'play'
            ? 'bg-primary/15 text-primary'
            : 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-secondary/60',
      ]"
      :title="seg.title"
      @click="ui.dmMode = seg.value"
    >
      {{ seg.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUiStore } from "@/stores/ui";

const { size = "sm", labels = ["PREP", "PLAY"] } = defineProps<{
  /** sm = chrome scale (sidebar, bottom bar); md = More-sheet scale. */
  size?: "sm" | "md";
  /** [prep, play] segment labels — the More sheet passes the verbose pair. */
  labels?: readonly [string, string];
}>();

const ui = useUiStore();

const segments = computed(
  () =>
    [
      {
        value: "prep",
        label: labels[0],
        title: "Prep mode — visibility changes stay silent.",
      },
      {
        value: "play",
        label: labels[1],
        title: "Play mode — visibility changes broadcast to chat.",
      },
    ] as const,
);
</script>
