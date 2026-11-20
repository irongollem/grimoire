<template>
  <!-- Frames 12, 13 and 15: the right column is the fight's own. A foe is a name and a word, never a number. -->
  <section class="flex flex-col gap-3 px-4 py-3.5" aria-label="The fight" data-testid="solo-fight-roster">
    <header class="flex flex-col gap-0.5">
      <span class="text-eyebrow text-muted-foreground">The fight</span>
      <h2 class="text-heading-sm font-bold text-foreground">{{ name }}</h2>
      <p class="text-caption text-muted-foreground">{{ state }}</p>
    </header>

    <div class="flex flex-col gap-1.5">
      <span class="text-eyebrow text-muted-foreground">{{ started ? "Turn order" : "Who is in it" }}</span>
      <ol class="flex flex-col gap-1">
        <li
          v-for="c in seen"
          :key="c.instanceId"
          class="flex items-baseline justify-between gap-2 rounded-md px-2 py-1.5"
          :class="c.instanceId === activeInstanceId ? 'bg-primary/10' : ''"
          :aria-current="c.instanceId === activeInstanceId ? 'true' : undefined"
        >
          <span class="flex min-w-0 flex-col">
            <span class="truncate text-body" :class="c.isYou ? 'font-bold text-foreground' : 'text-foreground'">{{ c.name }}</span>
            <span v-if="c.ally" class="text-caption text-muted-foreground">acts on their own</span>
          </span>
          <span v-if="c.health.kind === 'numbers'" class="shrink-0 text-caption font-bold tabular-nums text-foreground">{{ c.health.hp }} of {{ c.health.maxHp }}</span>
          <span v-else class="shrink-0 text-caption text-muted-foreground">{{ c.health.word }}</span>
        </li>
      </ol>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { SeenCombatant } from "@/lib/table/solo/fight/foeView";

const { name, started, round, seen, activeInstanceId } = defineProps<{
  name: string;
  started: boolean;
  round: number;
  seen: readonly SeenCombatant[];
  activeInstanceId: string | null;
}>();

const state = computed(() => (started ? `Round ${round}` : "Not begun · waiting on your initiative"));
</script>
