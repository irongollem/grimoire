<template>
  <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-labelledby="quest-outline-heading">
    <header class="flex items-baseline gap-2">
      <h3 id="quest-outline-heading" class="font-cinzel text-sm font-bold text-foreground">Outline</h3>
      <span class="ml-auto text-caption text-muted-foreground">keyboard-first list of the graph</span>
    </header>
    <ol>
      <li
        v-for="beat in beats"
        :key="beat.id"
        class="group flex items-center gap-2 py-1.5"
        :class="[
          reach(beat.id) === 'stranded' ? 'opacity-60' : '',
          reach(beat.id) === 'current' || reach(beat.id) === 'stranded' ? 'pl-3.5' : '',
        ]"
      >
        <!-- The state mark: a filled check square once visited, a thread-toned
             dot while a cursor stands here, an outlined square once cut off —
             everything else (ahead, unplayed) keeps the same width so titles
             still line up without claiming a state we don't draw. -->
        <span v-if="reach(beat.id) === 'visited'" class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded bg-tone-success text-white" aria-hidden="true">
          <IconCheck class="h-2.5 w-2.5" />
        </span>
        <span v-else-if="reach(beat.id) === 'current'" class="h-1.5 w-1.5 shrink-0 rounded-full" :class="rowDot(beat.id) ?? 'bg-muted-foreground'" aria-hidden="true" />
        <span v-else-if="reach(beat.id) === 'stranded'" class="h-3.5 w-3.5 shrink-0 rounded border-[0.09375rem] border-border" aria-hidden="true" />
        <span v-else class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <button class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="emit('command', { type: 'open', beatId: beat.id })">
          <span class="block truncate font-cinzel text-label-lg font-bold text-foreground">{{ beat.title || "Untitled beat" }}</span>
          <span class="mt-0.5 block truncate text-caption text-muted-foreground">{{ rowCaption(beat.id) || `${beat.kind} · ${beat.visibility}` }}</span>
        </button>
        <AppButton v-if="editable && selectedBeatId && selectedBeatId !== beat.id" label="Link" size="xs" variant="subtle" @click="emit('command', { type: 'link', sourceBeatId: selectedBeatId, targetBeatId: beat.id })" />
        <AppButton
          v-if="editable"
          :icon="IconClose"
          aria-label="Remove beat"
          tooltip="Remove beat"
          size="icon-xs"
          variant="ghost"
          tone="danger"
          class="shrink-0 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          @click="emit('command', { type: 'delete-beat', beatId: beat.id })"
        />
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { IconCheck, IconClose } from "@/lib/icons";
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import type { QuestGraphCommand } from "@/lib/quests/flow";
import type { QuestBeatPresentation, QuestBeatReach } from "@/lib/quests/presentation";
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

function reach(beatId: string): QuestBeatReach | undefined {
  return presentations[beatId]?.reach;
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
