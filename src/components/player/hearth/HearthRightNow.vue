<template>
  <HearthSection v-if="now" title="Right now">
    <RouterLink
      :to="{ name: 'play-quest-detail', params: { id: now.questId } }"
      class="torn bg-card border rounded-lg flex flex-col gap-1.5 p-3.5 transition-colors hover:bg-accent"
    >
      <span class="text-eyebrow text-muted-foreground">{{ now.title }}</span>
      <p v-for="line in now.current" :key="line.text" class="m-0 text-body">
        <span v-if="line.threadLabel" class="text-label text-muted-foreground">{{ line.threadLabel }}: </span>{{ line.text }}
      </p>
    </RouterLink>
  </HearthSection>
</template>

<script setup lang="ts">
import { computed } from "vue";
import HearthSection from "./HearthSection.vue";
import { usePlayerQuestBeats } from "@/composables/quests/useQuestFlow";
import { usePlayerVisibleQuests } from "@/composables/quests/useQuests";
import { currentBeatsByQuest } from "@/lib/hearth/currentBeats";

/**
 * The beat in play, in the words the DM wrote for players: the most recently
 * touched active quest that has one, linking to the quest. Nothing current,
 * nothing shown.
 */
const { data: quests } = usePlayerVisibleQuests();
const { data: beats } = usePlayerQuestBeats();

const now = computed(
  () => currentBeatsByQuest(quests.value ?? [], beats.value ?? []).find((q) => q.current.length > 0) ?? null,
);
</script>
