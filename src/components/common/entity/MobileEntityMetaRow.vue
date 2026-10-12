<template>
  <!--
    Mobile-only (<md) meta row for entity list screens: an italic
    "N of M {plural}". The rows/grid toggle lives in the page header
    (`ListLayoutToggle`), not here.
  -->
  <div class="py-2">
    <p class="text-body italic text-muted-foreground">
      {{ shown }} of {{ total }} {{ plural }}
    </p>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  shown: number;
  total: number;
  plural: string;
}>();
</script>
