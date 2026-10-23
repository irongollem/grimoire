<template>
  <div class="flex flex-col gap-2.5 rounded-md border border-border bg-card px-5 py-5">
    <h3 class="text-heading-sm font-semibold text-foreground">Never printed</h3>
    <p class="text-body text-muted-foreground">These stay out of every release, whatever you tick.</p>
    <p v-for="line in LINES" :key="line" class="flex items-baseline gap-2.5 text-body">
      <span class="size-2 shrink-0 rotate-45 bg-primary" aria-hidden="true" />
      {{ line }}
    </p>
  </div>
</template>

<script setup lang="ts">
const LINES = [
  "Your DM notes and secret blocks",
  "Quest progress, objectives and clocks",
  "Map pins, zones and rooms the party has not found",
  "A disguised person's true name, until revealed",
  "Players' journals and character sheets",
  "Anything shared with only some of the party",
];
</script>
