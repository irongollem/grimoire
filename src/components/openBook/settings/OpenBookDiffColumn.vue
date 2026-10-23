<template>
  <div>
    <h3 class="flex items-center gap-1.5 text-label-lg font-semibold uppercase text-muted-foreground">
      <span class="size-2 rotate-45" :class="markClass" aria-hidden="true" />
      {{ title }} · {{ count }}
    </h3>
    <p v-if="groups.length === 0" class="mt-2 text-caption text-muted-foreground">{{ empty }}</p>
    <div v-for="group in groups" :key="group.section" class="mt-3">
      <p class="text-caption text-muted-foreground">{{ group.label }}</p>
      <p v-for="(name, i) in group.names" :key="`${i}-${name}`" class="border-b border-border py-1.5 text-body">
        {{ name }}
      </p>
    </div>
    <p v-if="note && count > 0" class="mt-2 text-caption text-muted-foreground">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { DiffGroup } from "@/lib/openBook/releaseDiff";

const { groups } = defineProps<{
  title: string;
  groups: DiffGroup[];
  empty: string;
  markClass: string;
  note?: string;
}>();

const count = computed(() => groups.reduce((sum, g) => sum + g.names.length, 0));
</script>
