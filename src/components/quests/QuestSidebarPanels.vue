<template>
  <!-- Sub-quests -->
  <div
    v-if="!isNew"
    class="rounded-lg border border-border bg-card overflow-hidden"
  >
    <div
      class="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20"
    >
      <span
        class="text-label-lg font-semibold text-muted-foreground"
      >
        Sub-quests
        <span v-if="subQuests?.length" class="font-fell font-normal"
          >({{ subQuests.length }})</span
        >
      </span>
      <RouterLink
        :to="`/quests/new?parent=${questId}`"
        class="inline-flex items-center gap-1 text-label font-semibold text-primary hover:opacity-80 transition-opacity"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </RouterLink>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <p
        v-if="!subQuests?.length"
        class="text-caption text-muted-foreground italic px-2 py-2"
      >
        No sub-quests yet.
      </p>
      <RouterLink
        v-for="sub in subQuests"
        :key="sub.id"
        :to="`/quests/${sub.id}`"
        class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors group"
      >
        <span
          class="h-2 w-2 rounded-full shrink-0"
          :style="{ backgroundColor: QUEST_STATUS_COLORS[sub.status] }"
        />
        <span class="text-body text-foreground flex-1 truncate">{{
          sub.title || "Untitled"
        }}</span>
        <IconChevronRight
          class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary shrink-0"
        />
      </RouterLink>
    </div>
  </div>

  <!-- Party Notes (shared by players) -->
  <div
    v-if="!isNew && sharedNotes?.length"
    class="rounded-lg border border-border bg-card overflow-hidden"
  >
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span
        class="text-label-lg font-semibold text-muted-foreground"
      >
        Party Notes
        <span class="font-fell font-normal"
          >({{ sharedNotes.length }})</span
        >
      </span>
    </div>
    <div class="divide-y divide-border">
      <div v-for="note in sharedNotes" :key="note.id" class="px-3 py-2.5">
        <RichTextViewer :content="note.content ?? ''" />
        <p
          class="text-label text-muted-foreground/50 mt-1"
        >
          {{ note.updated_at.slice(0, 10) }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconAdd, IconChevronRight } from "@/lib/icons";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { QUEST_STATUS_COLORS } from "@/types/quest.types";
import type { QuestStatus } from "@/types/quest.types";

const { isNew, questId, subQuests, sharedNotes } = defineProps<{
  isNew: boolean;
  questId: string;
  subQuests:
    | Array<{ id: string; title: string; status: QuestStatus }>
    | undefined;
  sharedNotes:
    | Array<{ id: string; content: string | null; updated_at: string }>
    | undefined;
}>();
</script>
