<template>
  <HearthSection title="Your quests">
    <template #end>
      <RouterLink to="/play/journal" class="text-eyebrow text-primary hover:underline">Journal</RouterLink>
    </template>

    <ul v-if="rows.length" class="torn hearth-card divide-y divide-border/60 rounded-lg">
      <li v-for="row in rows" :key="row.questId">
        <RouterLink
          :to="{ name: 'play-quest-detail', params: { id: row.questId } }"
          class="flex min-h-11 items-start gap-3 px-3.5 py-2.5 hover:bg-accent/40"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-body font-semibold">{{ row.title }}</span>
            <span
              v-for="(line, i) in row.current"
              :key="i"
              class="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground"
            >
              <i class="inline-block h-1.5 w-1.5 shrink-0 rotate-45 bg-primary" aria-hidden="true" />
              <span class="min-w-0">
                <span v-if="line.threadLabel" class="text-eyebrow">{{ line.threadLabel }}: </span>{{ line.text }}
              </span>
            </span>
          </span>
          <EntityNewDot :is-new="unreadQuestIds.has(row.questId)" class="mt-1.5" />
        </RouterLink>
      </li>
    </ul>
    <BannerLoader v-else-if="isLoading" class="h-5" />
    <p v-else class="torn hearth-card rounded-lg px-3.5 py-3 text-body italic text-muted-foreground">
      No quests underway yet.
    </p>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";
import HearthSection from "@/components/play/hearth/HearthSection.vue";
import { usePlayerUnread } from "@/composables/play/usePlayerUnread";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { usePlayerQuestBeats } from "@/composables/quests/useQuestFlow";
import { currentBeatsByQuest } from "@/lib/hearth/currentBeats";

/**
 * Where each active quest stands: the player text of every beat a live thread
 * cursor is on. A quest with something unread carries the same red dot the
 * Journal does, read from the same list.
 */
const { data: quests, isLoading: questsLoading } = usePlayerVisibleQuests();
const { data: beats, isLoading: beatsLoading } = usePlayerQuestBeats();
const { items: unread } = usePlayerUnread();

const isLoading = computed(() => questsLoading.value || beatsLoading.value);
const rows = computed(() =>
  quests.value && beats.value ? currentBeatsByQuest(quests.value, beats.value) : [],
);
const unreadQuestIds = computed(
  () => new Set(unread.value.filter((i) => i.kind === "quest").map((i) => i.id)),
);
</script>
