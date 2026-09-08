<template>
  <section class="space-y-2" aria-label="Quest beat outline">
    <ol class="space-y-1">
      <li
        v-for="beat in beats"
        :key="beat.id"
        class="flex items-center gap-2 rounded-md border bg-card p-2"
        :class="presentations[beat.id]?.reach === 'current'
          ? 'border-primary ring-2 ring-primary/20'
          : presentations[beat.id]?.reach === 'stranded' ? 'border-border opacity-60' : 'border-border'"
      >
        <span v-if="rowDot(beat.id)" class="h-2 w-2 shrink-0 rounded-full" :class="rowDot(beat.id)" aria-hidden="true" />
        <button class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="emit('command', { type: 'open', beatId: beat.id })">
          <span class="block truncate font-semibold text-foreground">{{ beat.title || "Untitled beat" }}</span>
          <span class="text-caption uppercase text-muted-foreground">{{ beat.kind }} · {{ beat.visibility }}</span>
          <span v-if="rowCaption(beat.id)" class="mt-0.5 block text-caption" :class="presentations[beat.id]?.reach === 'stranded' ? 'text-tone-caution' : 'text-primary'">
            {{ rowCaption(beat.id) }}
          </span>
        </button>
        <AppButton v-if="editable && selectedBeatId && selectedBeatId !== beat.id" label="Link" size="xs" variant="subtle" @click="emit('command', { type: 'link', sourceBeatId: selectedBeatId, targetBeatId: beat.id })" />
        <AppButton v-if="editable" :icon="IconClose" aria-label="Remove beat" tooltip="Remove beat" size="icon-xs" variant="ghost" tone="danger" @click="emit('command', { type: 'delete-beat', beatId: beat.id })" />
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { IconClose } from "@/lib/icons";
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import type { QuestGraphCommand } from "@/lib/quests/flow";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import { threadBadge, type ThreadLike } from "@/lib/quests/threads";
import type { QuestBeat, QuestBeatEdge, QuestBeatTransition } from "@/types/quest.types";

/** A thread as the outline needs it — `ThreadLike` plus the one field that
 *  ties a parallel route back to the thread it opened. */
type OutlineThread = ThreadLike & { opened_by_edge_id: string | null };

const { beats, presentations = {}, edges = [], transitions = [], threads = [], selectedBeatId, editable = true } = defineProps<{
  beats: QuestBeat[];
  presentations?: Record<string, QuestBeatPresentation>;
  edges?: QuestBeatEdge[];
  transitions?: QuestBeatTransition[];
  threads?: OutlineThread[];
  selectedBeatId?: string | null;
  editable?: boolean;
}>();
const emit = defineEmits<{ command: [command: QuestGraphCommand] }>();

// The most recent transition to land on a beat, per beat — the only record
// of which thread actually walked it (a beat has no owning thread of its own).
const lastArrivalByBeat = computed(() => {
  const map = new Map<string, QuestBeatTransition>();
  for (const transition of transitions) {
    if (!transition.to_beat_id || !transition.thread_id) continue;
    map.set(transition.to_beat_id, transition);
  }
  return map;
});

// A beat that sourced a parallel route which actually opened a thread — used
// to append " · opened Thread B" onto the beat that spawned it.
const openedThreadLabelByBeat = computed(() => {
  const map = new Map<string, string>();
  for (const edge of edges) {
    if (edge.route_kind !== "parallel") continue;
    const opened = threads.find((thread) => thread.opened_by_edge_id === edge.id);
    if (!opened) continue;
    const badge = threadBadge(threads, opened.id);
    if (badge) map.set(edge.source_beat_id, `opened Thread ${badge.letter}`);
  }
  return map;
});

function threadRef(threadId: string | null | undefined): string | null {
  if (!threadId) return null;
  const badge = threadBadge(threads, threadId);
  return badge ? `Thread ${badge.letter}` : null;
}

function rowDot(beatId: string): string | null {
  const presentation = presentations[beatId];
  const threadId = presentation?.currentThreadIds[0] ?? lastArrivalByBeat.value.get(beatId)?.thread_id ?? undefined;
  return threadId ? threadBadge(threads, threadId)?.tone.dot ?? null : null;
}

function rowCaption(beatId: string): string {
  const presentation = presentations[beatId];
  if (!presentation) return "";
  if (presentation.reach === "stranded") return "Cut off by a choice";
  const openedSuffix = openedThreadLabelByBeat.value.get(beatId);
  if (presentation.reach === "current") {
    const ref = threadRef(presentation.currentThreadIds[0]);
    const gapSuffix = presentation.prepGapCount ? ` · ${presentation.prepGapCount} prep gap${presentation.prepGapCount === 1 ? '' : 's'}` : "";
    return ref ? `${ref} · current${gapSuffix}` : `Party is here${gapSuffix}`;
  }
  if (presentation.reach === "visited") {
    const ref = threadRef(lastArrivalByBeat.value.get(beatId)?.thread_id);
    const base = ref ? `${ref} · visited` : "Played";
    return openedSuffix ? `${base} · ${openedSuffix}` : base;
  }
  return "";
}
</script>
