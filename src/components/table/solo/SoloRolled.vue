<template>
  <!-- The player's own roll in the story (Roll, 05): the total set large, who rolled what, and the dice behind it.
       No success or failure here: the narration says how it went. -->
  <div class="flex items-center gap-3.5 pl-7" data-testid="solo-rolled">
    <span class="font-stat min-w-14 text-center text-[2.5rem] leading-none font-semibold text-primary">{{ line.total }}</span>
    <span class="flex min-w-0 flex-col gap-0.5">
      <span class="text-eyebrow text-foreground">{{ line.title }}</span>
      <span class="text-caption text-muted-foreground">{{ line.detail }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Rolled } from "@/lib/table/soloTypes";
import { rollLine } from "@/lib/table/tableRoll";

const { roll, who } = defineProps<{ roll: Rolled; who: string }>();
const line = computed(() => rollLine(roll, who));
</script>
