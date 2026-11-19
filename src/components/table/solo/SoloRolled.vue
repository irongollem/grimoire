<template>
  <!-- A roll in the story (Roll, 05; Table, 02): the total set large, who rolled what, and the dice behind it.
       No success or failure here: the narration says how it went. A roll the server made carries its mark, the
       player's own does not ("written into the story as yours, without the server's mark"). -->
  <div class="flex items-center gap-3.5 pl-7" data-testid="solo-rolled">
    <span class="font-stat min-w-12 text-center text-[2rem] leading-none font-semibold" :class="byServer ? 'text-muted-foreground' : 'text-primary'">{{ line.total }}</span>
    <span class="flex min-w-0 flex-col gap-0.5">
      <span class="text-eyebrow text-foreground">{{ line.title }}</span>
      <span class="text-caption text-muted-foreground">{{ line.detail }}<template v-if="byServer"> · Rolled by Grimoire</template></span>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { RollLine } from "@/lib/table/solo/tableRoll";

const { byServer = false } = defineProps<{
  line: RollLine;
  /** The server rolled it (the Dungeon Master's dice), so it carries the server's mark. */
  byServer?: boolean;
}>();
</script>
