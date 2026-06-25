<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-xl font-bold text-foreground">Quest Log</h2>

    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <div v-else-if="!quests?.length" class="text-center py-12">
      <IconNavQuests class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p class="font-fell text-muted-foreground italic">
        No quests shared by your DM yet.
      </p>
    </div>

    <template v-else>
      <div v-for="[label, group] in groups" :key="label">
        <div v-if="group.length" class="space-y-2 mb-4">
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >
            {{ label }}
          </p>
          <RouterLink
            v-for="q in group"
            :key="q.id"
            :to="`/play/quests/${q.id}`"
            class="block rounded-lg border border-border bg-card p-4 hover:border-primary/40 transition-colors"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span v-if="isNew(q.id, q.updated_at)" class="h-2.5 w-2.5 rounded-full bg-destructive shrink-0" title="New" />
                <p class="font-cinzel text-sm font-semibold text-foreground">
                  {{ q.title }}
                </p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span
                  class="font-cinzel text-2xs md:text-sm px-2 py-0.5 rounded-full tracking-wider"
                  :style="{
                    color: QUEST_STATUS_COLORS[q.status],
                    borderColor: QUEST_STATUS_COLORS[q.status] + '50',
                  }"
                  style="border-width: 1px"
                >
                  {{ QUEST_STATUS_LABELS[q.status] }}
                </span>
                <IconChevronRight class="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            <p
              v-if="q.summary"
              class="font-fell text-sm text-muted-foreground mt-1"
            >
              {{ q.summary }}
            </p>
            <div v-if="q.rewards" class="mt-2 flex items-center gap-1.5">
              <IconStar class="h-3 w-3 text-gold-500 shrink-0" />
              <span class="font-fell text-xs text-muted-foreground">{{
                q.rewards
              }}</span>
            </div>
          </RouterLink>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconChevronRight, IconNavQuests, IconStar } from '@/lib/icons';
import { usePlayerVisibleQuests } from "@/composables/useQuests";
import { useReadItems } from "@/composables/useReadItems";
import { QUEST_STATUS_LABELS, QUEST_STATUS_COLORS } from "@/types/quest.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import type { Quest } from "@/types/quest.types";

const { data: quests, isLoading } = usePlayerVisibleQuests();
const { isNew } = useReadItems("quest");

const groups = computed<[string, Quest[]][]>(() => [
  ["Active", (quests.value ?? []).filter((q) => q.status === "active")],
  ["Rumor", (quests.value ?? []).filter((q) => q.status === "rumor")],
  ["Completed", (quests.value ?? []).filter((q) => q.status === "completed")],
  ["Failed", (quests.value ?? []).filter((q) => q.status === "failed")],
]);
</script>
