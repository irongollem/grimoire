<template>
  <div class="ink-seep flex flex-col items-center justify-center py-16 text-center px-4" :style="inkStyle">
    <!-- Icon slot or default scroll icon -->
    <div class="mb-4 text-muted-foreground/40">
      <slot name="icon">
        <IconQuest class="h-16 w-16" />
      </slot>
    </div>

    <h3 class="text-heading font-semibold text-foreground mb-2">
      {{ title }}
    </h3>
    <p class="font-fell text-muted-foreground italic max-w-sm mb-6">
      {{ description }}
    </p>

    <slot name="action" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { IconQuest } from '@/lib/icons';
import { inkSeepStyle } from '@/lib/inkSeep';

const { title, description, inkSeed } = defineProps<{
  title: string;
  description: string;
  /** Seeds the Vellum ink stain (asset, position, angle). Defaults to the title,
   *  so each empty screen keeps its own stain across renders. */
  inkSeed?: string;
}>();

const inkStyle = computed(() => inkSeepStyle(inkSeed ?? title));
</script>
