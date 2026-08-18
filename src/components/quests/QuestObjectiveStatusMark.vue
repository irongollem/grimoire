<template>
  <!-- The same three-state mark for the DM's editable list and the player's
       read-only one, so an objective cannot come to mean different things on
       the two screens it appears on. Colour is never the only signal: each
       state has its own glyph, and the label rides along for screen readers. -->
  <span
    class="shrink-0 flex h-4 w-4 items-center justify-center rounded border"
    :class="{
      'bg-primary border-primary text-primary-foreground': status === 'complete',
      'bg-destructive border-destructive text-destructive-foreground': status === 'failed',
      'border-border': status === 'pending',
    }"
  >
    <IconCheck v-if="status === 'complete'" class="h-2.5 w-2.5" />
    <IconClose v-else-if="status === 'failed'" class="h-2.5 w-2.5" />
    <span class="sr-only">{{ QUEST_OBJECTIVE_STATUS_LABELS[status] }}</span>
  </span>
</template>

<script setup lang="ts">
import { IconCheck, IconClose } from "@/lib/icons";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import type { QuestObjectiveStatus } from "@/types/quest.types";

defineProps<{ status: QuestObjectiveStatus }>();
</script>
