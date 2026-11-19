<template>
  <div
    class="flex flex-col gap-2 rounded-md p-3"
    :class="next ? 'border-2 border-primary bg-card' : 'border border-border'"
  >
    <div class="flex items-baseline gap-2.5">
      <span class="font-cinzel text-heading-sm font-bold">Level {{ milestone.level }}</span>
      <span v-if="next" class="text-eyebrow text-primary">Next</span>
      <span class="flex-1" />
      <span class="text-caption text-muted-foreground">{{ done }} of {{ milestone.needs }} done</span>
    </div>
    <div
      role="meter"
      :aria-label="`${done} of ${milestone.needs} done`"
      :aria-valuenow="done"
      aria-valuemin="0"
      :aria-valuemax="milestone.needs"
      class="grid gap-1"
      :style="{ gridTemplateColumns: `repeat(${milestone.needs}, minmax(0, 1fr))` }"
    >
      <span v-for="n in milestone.needs" :key="n" class="h-1.5" :class="n <= done ? 'bg-primary' : 'bg-muted'" />
    </div>
    <span class="text-caption text-muted-foreground">
      When any {{ milestone.needs }} of {{ milestone.items.length === milestone.needs ? "these" : `these ${milestone.items.length}` }} {{ milestone.needs === 1 ? "is" : "are" }} done
    </span>
    <ul class="space-y-1 text-body">
      <li v-for="item in shown" :key="item.id" class="flex items-center gap-2">
        <component
          :is="item.done ? IconCheck : IconCircle"
          class="h-3.5 w-3.5 shrink-0"
          :class="item.done ? 'text-primary' : 'text-muted-foreground'"
          :aria-label="item.done ? 'Done' : 'Not done yet'"
        />
        <RouterLink v-if="item.questId" :to="`/quests/${item.questId}`" class="truncate hover:underline">{{ item.label }}</RouterLink>
        <span v-else class="truncate">{{ item.label }}<span v-if="item.questTitle" class="text-muted-foreground"> · {{ item.questTitle }}</span></span>
      </li>
      <li v-if="hidden > 0" class="italic text-muted-foreground">and {{ hidden }} more</li>
    </ul>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconCheck, IconCircle } from "@/lib/icons";
import type { LevelMilestone } from "@/composables/party/useLevelMilestones";

/** One milestone on the Level Plan (#1021 row 27): what it waits on and how far along it is. `next` draws it gilt. */
const { milestone, next = false } = defineProps<{ milestone: LevelMilestone; next?: boolean }>();

/** A column shows four items; the rest are counted, so a long milestone does not stretch the strip. */
const SHOWN = 4;
const done = computed(() => Math.min(milestone.items.filter((i) => i.done).length, milestone.needs));
// Done items first: what is left is what the DM reads for.
const shown = computed(() => [...milestone.items].sort((a, b) => Number(b.done) - Number(a.done)).slice(0, SHOWN));
const hidden = computed(() => Math.max(0, milestone.items.length - SHOWN));
</script>
