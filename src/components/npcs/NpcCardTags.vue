<template>
  <!-- The first three tags of an NPC on its grid card: in the body over the plate, in the foot art-free (#1179). -->
  <div v-if="tags.length" class="flex flex-wrap gap-1">
    <span v-for="tag in tags.slice(0, 3)" :key="tag" class="rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground">
      {{ tag }}
    </span>
    <span v-if="tags.length > 3" class="self-center text-caption-sm text-muted-foreground italic">
      +{{ tags.length - 3 }}
    </span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ tags: readonly string[] }>();
</script>
