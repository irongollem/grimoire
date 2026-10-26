<template>
  <!-- The nodes focused so far, newest last; a tap walks back to it. -->
  <nav v-if="trail.length > 1" class="flex min-w-0 flex-wrap items-center gap-x-1 text-caption" aria-label="Focus trail">
    <template v-for="(item, i) in trail" :key="`${item.key}-${i}`">
      <IconChevronRight v-if="i > 0" class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span v-if="i === trail.length - 1" class="truncate font-semibold text-foreground" aria-current="location">{{ item.name }}</span>
      <AppButton v-else variant="link" size="inline-caption" :label="item.name" class="truncate" @click="emit('walk', i)" />
    </template>
  </nav>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconChevronRight } from "@/lib/icons";

defineProps<{ trail: readonly { key: string; name: string }[] }>();
const emit = defineEmits<{ walk: [index: number] }>();
</script>
