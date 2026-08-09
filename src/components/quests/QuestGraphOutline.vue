<template>
  <section class="space-y-2" aria-label="Quest beat outline">
    <AppButton v-if="editable" :label="selectedBeatId ? 'Add next beat' : 'Add beat'" size="sm" @click="emit('command', { type: 'create', sourceBeatId: selectedBeatId || undefined })" />
    <ol class="space-y-1">
      <li v-for="beat in beats" :key="beat.id" class="flex items-center gap-2 rounded-md border border-border bg-card p-2">
        <button class="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" @click="emit('command', { type: 'open', beatId: beat.id })">
          <span class="block truncate font-semibold text-foreground">{{ beat.title || "Untitled beat" }}</span>
          <span class="text-caption uppercase text-muted-foreground">{{ beat.kind }} · {{ beat.visibility }}</span>
        </button>
        <AppButton v-if="editable && selectedBeatId && selectedBeatId !== beat.id" label="Link" size="xs" variant="subtle" @click="emit('command', { type: 'link', sourceBeatId: selectedBeatId, targetBeatId: beat.id })" />
        <AppButton v-if="editable" label="Delete" size="xs" variant="destructive" @click="emit('command', { type: 'delete-beat', beatId: beat.id })" />
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import type { QuestGraphCommand } from "@/lib/quests/flow";
import type { QuestBeat } from "@/types/quest.types";

withDefaults(defineProps<{ beats: QuestBeat[]; selectedBeatId?: string | null; editable?: boolean }>(), { editable: true });
const emit = defineEmits<{ command: [command: QuestGraphCommand] }>();
</script>
