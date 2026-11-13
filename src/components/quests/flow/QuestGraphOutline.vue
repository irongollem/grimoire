<template>
  <!-- The card never scrolls itself: under Vellum its paper is a ::before,
       which would scroll away with the rows and leave them hanging past the
       torn edge. The list scrolls inside it when a parent caps the height. -->
  <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" aria-labelledby="quest-outline-heading">
    <header class="flex shrink-0 items-baseline gap-2">
      <h3 id="quest-outline-heading" class="text-heading-sm font-bold text-foreground">Outline</h3>
      <span class="ml-auto text-caption text-muted-foreground">keyboard-first list of the graph</span>
    </header>
    <ol class="min-h-0 flex-1 overflow-y-auto">
      <li
        v-for="beat in beats"
        :key="beat.id"
        class="group flex items-center gap-2 py-1.5"
        :class="['rounded-md px-2', FILL_TINT[markOf(beat.id).fill], markOf(beat.id).unreachable ? 'opacity-40' : '']"
      >
        <!-- The same bookmark as the canvas node; both read beatMark(). -->
        <QuestBeatBookmark :state="markOf(beat.id).bookmark" />
        <span class="sr-only">{{ markOf(beat.id).label }}</span>
        <button class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="emit('command', { type: 'open', beatId: beat.id })">
          <span class="block truncate text-label-lg font-bold text-foreground" :class="{ 'line-through': markOf(beat.id).unreachable }">{{ beat.title || "Untitled beat" }}</span>
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
import { IconClose } from "@/lib/icons";
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import QuestBeatBookmark from "./QuestBeatBookmark.vue";
import { beatMark, type BeatFill } from "@/lib/quests/beatMark";
import type { QuestGraphCommand } from "@/lib/quests/flow";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import { threadBadge, type ThreadLike } from "@/lib/quests/threads";
import type { QuestBeat, QuestBeatEdge, QuestBeatTransition } from "@/types/quest.types";

/** A thread as the outline needs it — `ThreadLike` plus the one field that
 *  ties a parallel route back to the thread it opened. */
type OutlineThread = ThreadLike & { opened_by_edge_id: string | null };

const { beats, presentations = {}, edges = [], transitions = [], threads = [], selectedBeatId, editable = true, entryBeatId } = defineProps<{
  beats: QuestBeat[];
  presentations?: Record<string, QuestBeatPresentation>;
  edges?: QuestBeatEdge[];
  transitions?: QuestBeatTransition[];
  threads?: OutlineThread[];
  selectedBeatId?: string | null;
  editable?: boolean;
  /** The quest's entry beat, which reads green until the party stands on it. */
  entryBeatId?: string | null;
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

const FILL_TINT: Record<BeatFill, string> = {
  here: "bg-primary/15",
  start: "bg-tone-success/15",
  past: "",
  pending: "bg-muted/50",
};

function markOf(beatId: string) {
  return beatMark(presentations[beatId], entryBeatId === beatId);
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
