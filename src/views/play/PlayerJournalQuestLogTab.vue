<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <LoadingSpinner />
  </div>
  <div v-else-if="!quests.length" class="text-center py-12">
    <IconScrollText class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">No quests shared by your DM yet.</p>
  </div>
  <template v-else>
    <div v-for="[label, group] in questGroups" :key="label">
      <div v-if="group.length" class="space-y-2 mb-4">
        <p class="text-label-lg font-semibold text-muted-foreground">{{ label }}</p>
        <RouterLink
          v-for="q in group"
          :key="q.id"
          :to="`/play/quests/${q.id}`"
          class="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <EntityNewDot :is-new="isQuestNew(q.id, q.updated_at)" title="New" />
              <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ q.title }}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <span
                class="text-label px-2 py-0.5 rounded-full"
                :style="{ color: QUEST_STATUS_COLORS[q.status], borderColor: QUEST_STATUS_COLORS[q.status] + '50' }"
                style="border-width: 1px"
              >{{ QUEST_STATUS_LABELS[q.status] }}</span>
              <IconChevronRight class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <p v-if="q.summary" class="text-body text-muted-foreground mt-1">{{ q.summary }}</p>
        </RouterLink>
      </div>
    </div>
  </template>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { IconChevronRight, IconScrollText } from '@/lib/icons';
import EntityNewDot from '@/components/common/EntityNewDot.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from '@/types/quest.types';
import type { Quest } from '@/types/quest.types';

defineProps<{
  isLoading: boolean;
  quests: Quest[];
  questGroups: [string, Quest[]][];
  isQuestNew: (id: string, updatedAt: string) => boolean;
}>();
</script>
