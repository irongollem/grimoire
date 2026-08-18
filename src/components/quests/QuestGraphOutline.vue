<template>
  <section class="space-y-2" aria-label="Quest beat outline">
    <AppButton v-if="editable" :label="selectedBeatId ? 'Add next beat' : 'Add beat'" size="sm" @click="emit('command', { type: 'create', sourceBeatId: selectedBeatId || undefined })" />
    <QuestRunTally :tally="tally" />
    <ol class="space-y-1">
      <li
        v-for="beat in beats"
        :key="beat.id"
        class="flex items-center gap-2 rounded-md border bg-card p-2"
        :class="presentations[beat.id]?.reach === 'current'
          ? 'border-primary ring-2 ring-primary/20'
          : presentations[beat.id]?.reach === 'stranded' ? 'border-border opacity-60' : 'border-border'"
      >
        <button class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="emit('command', { type: 'open', beatId: beat.id })">
          <span class="block truncate font-semibold text-foreground">{{ beat.title || "Untitled beat" }}</span>
          <span class="text-caption uppercase text-muted-foreground">{{ beat.kind }} · {{ beat.visibility }}</span>
          <span v-if="OUTLINE_REACH_LABELS[presentations[beat.id]?.reach ?? 'unplayed']" class="mt-0.5 block text-caption" :class="presentations[beat.id]?.reach === 'stranded' ? 'text-tone-caution' : 'text-primary'">
            {{ OUTLINE_REACH_LABELS[presentations[beat.id]?.reach ?? "unplayed"] }}
          </span>
        </button>
        <AppButton v-if="editable && selectedBeatId && selectedBeatId !== beat.id" label="Link" size="xs" variant="subtle" @click="emit('command', { type: 'link', sourceBeatId: selectedBeatId, targetBeatId: beat.id })" />
        <AppButton v-if="editable && !beat.is_overview" label="Delete" size="xs" variant="destructive" @click="emit('command', { type: 'delete-beat', beatId: beat.id })" />
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import QuestRunTally from "./QuestRunTally.vue";
import type { QuestGraphCommand } from "@/lib/quests/flow";
import { tallyQuestReach, type QuestBeatPresentation, type QuestBeatReach } from "@/lib/quests/presentation";
import type { QuestBeat } from "@/types/quest.types";

// The outline is the whole story flow below 48rem, where the canvas is hidden,
// so it carries the same run bookkeeping in words instead of node styling.
const OUTLINE_REACH_LABELS: Record<QuestBeatReach, string> = {
  current: "Party is here",
  visited: "Played",
  stranded: "Cut off — no longer reachable",
  ahead: "",
  unplayed: "",
};

const { beats, presentations = {}, selectedBeatId, editable = true } = defineProps<{ beats: QuestBeat[]; presentations?: Record<string, QuestBeatPresentation>; selectedBeatId?: string | null; editable?: boolean }>();
const emit = defineEmits<{ command: [command: QuestGraphCommand] }>();
const tally = computed(() => tallyQuestReach(presentations));
</script>
