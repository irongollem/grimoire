<template>
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
    <span v-for="item in LEGEND_ITEMS" :key="item.label" class="flex items-center gap-1.5">
      <span
        class="shrink-0"
        :class="item.shape === 'bar' ? 'h-1 w-3 rounded-sm' : 'h-2.5 w-2.5 rounded-full'"
        :style="{ backgroundColor: item.color }"
        aria-hidden="true"
      />
      {{ item.label }}
    </span>
  </div>
</template>

<script setup lang="ts">
/**
 * The reading key under a site's map (#868, frame 03) — what a dot's colour
 * and a bar's colour mean, so a DM doesn't have to learn the palette by
 * clicking every region once. Static: the five entries name every state the
 * map's overlays (spaces, and S5's ways-out) can be in, not any one site's
 * current content, so there is nothing here to compute from props.
 */
const LEGEND_ITEMS: Array<{ label: string; color: string; shape: "dot" | "bar" }> = [
  { label: "Bound to a room", color: "rgba(74, 222, 128, 0.85)", shape: "dot" },
  { label: "Traced, unbound", color: "rgba(251, 191, 36, 0.85)", shape: "dot" },
  { label: "Selected", color: "rgba(96, 165, 250, 0.85)", shape: "dot" },
  { label: "Locked way out", color: "rgba(251, 191, 36, 0.85)", shape: "bar" },
  { label: "Secret", color: "rgba(167, 139, 250, 0.85)", shape: "bar" },
];
</script>
