<template>
  <!-- The player sees that time is running out and how much is left, never what is coming: that is the story's to tell. -->
  <section class="flex flex-col gap-2 px-4 py-3.5" role="status" :aria-label="spoken" data-testid="solo-pressure">
    <span class="text-eyebrow" :class="out ? 'text-destructive' : 'text-muted-foreground'">{{ out ? "Out of time" : "Time is short" }}</span>
    <div class="flex flex-wrap gap-1.5" aria-hidden="true">
      <span
        v-for="n in pressure.segments"
        :key="n"
        class="size-3.5 rounded-full border"
        :class="n <= pressure.filled ? 'border-destructive bg-destructive' : 'border-input bg-transparent'"
        :data-filled="n <= pressure.filled ? 'true' : undefined"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { pressureSpoken } from "@/lib/table/pressureLabel";
import type { TablePressure } from "@/lib/table/soloTypes";

const { pressure } = defineProps<{ pressure: TablePressure }>();

const out = computed(() => pressure.filled >= pressure.segments);
const spoken = computed(() => pressureSpoken(pressure));
</script>
