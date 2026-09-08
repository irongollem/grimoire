<template>
  <section class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Story so far">
    <div class="flex items-center justify-between gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Story so far</h3>
      <span class="text-caption text-muted-foreground">{{ threadLabel }}</span>
    </div>
    <ul v-if="rows.length" class="flex flex-col gap-1.5">
      <li v-for="row in rows" :key="row.beatId" class="flex items-start gap-2">
        <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" :class="row.state === 'current' ? 'bg-primary' : 'bg-muted-foreground'" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-body font-semibold" :class="row.state === 'current' ? 'text-primary' : 'text-foreground'">{{ row.title }}</span>
          <span v-if="row.caption" class="block text-caption text-muted-foreground">{{ row.caption }}</span>
        </span>
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">Nothing played yet on this thread.</p>
  </section>
</template>

<script setup lang="ts">
/**
 * "The story so far", scoped to one thread (#853, story F, `Runner` board):
 * every beat this thread has played, oldest first, then the beat it is at
 * now. `storySpine` orders and dedupes the rows; this component captions each
 * one with the transition that actually carried the party there — "enter ·
 * session 22" — rather than `storySpine`'s own `note` (a ledger-delta
 * summary), which the cockpit's Objectives panel already shows.
 */
import { computed } from "vue";
import { timeAgo } from "@/lib/utils";
import { storySpine } from "@/lib/quests/ledger";
import { describeSpineSession, findBeatArrival } from "@/lib/quests/run";
import { threadBadge } from "@/lib/quests/threads";
import type {
  QuestBeat,
  QuestConsequence,
  QuestObjective,
  QuestRuntimeChoice,
  QuestThreadCursor,
} from "@/types/quest.types";

const { questId, threadId, beats, pathSoFar, currentBeatId, outgoing, consequences, objectives, threads } = defineProps<{
  questId: string;
  threadId: string;
  beats: Array<Pick<QuestBeat, "id" | "title" | "staged_at_location_id">>;
  pathSoFar: Array<Record<string, unknown>>;
  currentBeatId: string | null;
  outgoing: QuestRuntimeChoice[];
  consequences: QuestConsequence[];
  objectives: QuestObjective[];
  threads: QuestThreadCursor[];
}>();

const threadLabel = computed(() => {
  const badge = threadBadge(threads, threadId);
  return badge ? `Thread ${badge.letter}` : "";
});

const rows = computed(() => storySpine({
  questId, beats, transitions: pathSoFar, currentBeatId, outgoing, consequences, objectives, threadId,
})
  .filter((entry) => entry.state !== "next")
  .map((entry) => {
    const arrival = findBeatArrival(pathSoFar, questId, entry.beatId, entry.state === "current");
    const session = describeSpineSession(arrival, timeAgo);
    return {
      beatId: entry.beatId,
      title: entry.title,
      state: entry.state,
      caption: arrival ? [arrival.kind, session].filter(Boolean).join(" · ") : "",
    };
  }));
</script>
