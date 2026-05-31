<template>
  <!--
    Mobile-only (<md) quick-fact cell for the 2-col NPC detail grid.
    Renders nothing when the value is blank so the grid collapses gracefully.
    A tiny uppercase Cinzel label sits above the value (IM Fell body).
  -->
  <div v-if="value" class="flex flex-col gap-0.5 px-3 py-2.5">
    <span class="font-cinzel text-2xs font-bold uppercase tracking-widest text-muted-foreground">
      {{ label }}
    </span>
    <span class="font-fell text-sm leading-snug text-foreground">
      {{ value }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value?: string | null;
}>();
</script>
