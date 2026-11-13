<template>
  <section class="space-y-3" aria-label="What a player sees">
    <QuestPlayersSection :quest="quest" />
    <div class="space-y-2 rounded-lg border border-border bg-card p-3">
      <label class="block space-y-1 text-caption font-semibold text-foreground">
        As
        <AppSelect v-model="audienceId" aria-label="Preview audience">
          <option value="">Choose a shared character…</option>
          <option v-for="member in audienceOptions" :key="member.id" :value="member.id">{{ member.name }}</option>
        </AppSelect>
      </label>
      <p v-if="!audienceOptions.length" class="text-caption text-tone-caution">Not shared with a party character yet.</p>
      <QuestPlayerPreviewBody :audience-id="audienceId" :loading="beatsQuery.isLoading.value" :error="Boolean(beatsQuery.error.value)" :beats="beats" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useQuestPreviewAudience } from "@/composables/quests/useQuestPreviewAudience";
import type { Quest } from "@/types/quest.types";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import QuestPlayersSection from "./QuestPlayersSection.vue";
import QuestPlayerPreviewBody from "../run/QuestPlayerPreviewBody.vue";

const { quest } = defineProps<{ quest: Quest }>();
const { audienceId, audienceOptions, beatsQuery, beats } = useQuestPreviewAudience(() => quest.id, () => quest.player_visible_to);
</script>
