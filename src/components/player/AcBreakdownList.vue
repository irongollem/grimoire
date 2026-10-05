<template>
  <div>
    <ul class="divide-y divide-border/60">
      <li v-for="(part, i) in breakdown.parts" :key="`${part.label}-${i}`" class="flex items-baseline justify-between gap-4 py-1.5">
        <span class="text-body">{{ part.label }}</span>
        <span class="text-body tabular-nums font-semibold">{{ format(part.value, i) }}</span>
      </li>
    </ul>
    <div class="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2">
      <span class="text-body font-semibold">Armor Class</span>
      <span class="text-heading-sm font-bold tabular-nums">{{ breakdown.total }}</span>
    </div>
    <p v-for="note in breakdown.notes" :key="note" class="mt-2 text-caption text-muted-foreground">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import type { AcBreakdown } from "@/rules/armorClass";

defineProps<{ breakdown: AcBreakdown }>();

/** The first line is the starting number; every other line is an adjustment to it. */
function format(value: number, index: number): string {
  if (index === 0) return String(value);
  return value >= 0 ? `+${value}` : `−${Math.abs(value)}`;
}
</script>
