<template>
  <section class="rounded-lg border border-border bg-card p-3" aria-label="Quest threads">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Threads</h3>
      <span v-if="liveCount" class="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-label uppercase text-primary">{{ liveCount }} live</span>
    </header>
    <ul class="mt-2 space-y-1.5">
      <li
        v-for="row in rows"
        :key="row.badge.thread.id"
        class="group flex items-center gap-2 rounded-md border bg-background p-2"
        :class="row.badge.tone.border"
      >
        <span class="h-2 w-2 shrink-0 rounded-full" :class="row.badge.tone.dot" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-caption font-semibold text-foreground">{{ row.badge.letter }} · {{ row.badge.thread.label }}</p>
          <p class="truncate text-caption text-muted-foreground">{{ row.caption }}</p>
        </div>
        <AppButton label="Focus" size="xs" variant="subtle" @click="emit('focus', row.badge.thread.id)" />
        <AppButton
          v-if="row.badge.thread.status === 'live'"
          :icon="IconClose"
          aria-label="Close thread"
          tooltip="Close thread"
          size="icon-xs"
          variant="ghost"
          tone="danger"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          @click="closeThread(row.badge.thread.id, row.badge.thread.label)"
        />
      </li>
    </ul>
    <p class="mt-2 text-caption text-muted-foreground">Closing a thread is your call, here or in the cockpit — nothing closes on its own.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose } from "@/lib/icons";
import { useCloseQuestThread } from "@/composables/quests/useQuestThreads";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { threadBadges } from "@/lib/quests/threads";
import type { QuestBeat, QuestBeatEdge, QuestThread } from "@/types/quest.types";

const { questId, campaignId, threads, beats, edges, currentBeatIdByThread = {}, visitedCountByThread = {} } = defineProps<{
  questId: string;
  campaignId: string;
  threads: QuestThread[];
  beats: QuestBeat[];
  edges: QuestBeatEdge[];
  currentBeatIdByThread?: Record<string, string | null>;
  visitedCountByThread?: Record<string, number>;
}>();
const emit = defineEmits<{ focus: [threadId: string] }>();

function beatTitle(id: string | null | undefined): string {
  return beats.find((beat) => beat.id === id)?.title || "Missing beat";
}

const rows = computed(() => threadBadges(threads).map((badge) => {
  const currentBeatId = currentBeatIdByThread[badge.thread.id];
  let caption = "";
  if (currentBeatId) {
    const visited = visitedCountByThread[badge.thread.id] ?? 0;
    caption = `${beatTitle(currentBeatId)} · ${visited} visited`;
  } else if (badge.thread.opened_by_edge_id) {
    const openingEdge = edges.find((edge) => edge.id === badge.thread.opened_by_edge_id);
    caption = openingEdge ? `Opened by a parallel route at ${beatTitle(openingEdge.source_beat_id)}` : "";
  }
  return { badge, caption };
}));
const liveCount = computed(() => threads.filter((thread) => thread.status === "live").length);

const closeThreadMutation = useCloseQuestThread();
const { confirm } = useConfirm();
const toast = useToast();

async function closeThread(threadId: string, label: string) {
  if (!await confirm(`Close thread “${label}”? Its cursor stops advancing; nothing already played is undone.`, { title: "Close this thread?", confirmLabel: "Close thread" })) return;
  try {
    await closeThreadMutation.mutateAsync({ campaignId, questId, threadId });
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}
</script>
