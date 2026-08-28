<template>
  <DashboardWidget
    title="Needs prep"
    tone="caution"
    :count="rows.length || null"
    to="/quests"
    action-label="Quest log →"
    :loading="isLoading"
    :empty="!rows.length"
    empty-text="Nothing is missing. Every prepared beat has what it needs."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.quest.id"
        :to="`/quests/${row.quest.id}?view=work`"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.quest.title || "Untitled Quest" }}
          </p>
          <p class="text-caption text-muted-foreground italic">{{ row.reason }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="String(row.count)"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAllQuests } from "@/composables/quests/useQuests";
import { useQuestBoardSummaries } from "@/composables/quests/useQuestFlow";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * What is missing, which is the question between sessions.
 *
 * Both signals already existed and neither was visible outside the quest board.
 *
 * A **prep gap** is `deriveQuestBeatPrepGaps` — deliberately broader than a
 * deleted attachment: a beat with no DM guidance, a rumored beat with no rumor
 * copy, a revealed beat with no reveal copy (the player thread silently drops
 * it), an unreviewed improvised beat, or a staging beat still disconnected from
 * the flow. The count cannot say which, so the copy here says "not ready to
 * run" rather than naming a cause it does not know.
 *
 * **Undispatched loot** is a reward the party earned that never reached them.
 * Gaps sort above it: a beat that cannot run blocks the evening, an
 * undelivered reward only disappoints afterwards.
 */
const { data: quests, isLoading: questsLoading } = useAllQuests();
const { data: summaries, isLoading: summariesLoading } = useQuestBoardSummaries();
const isLoading = computed(() => questsLoading.value || summariesLoading.value);

const rows = computed(() => {
  const byId = summaries.value ?? {};
  return (quests.value ?? [])
    .filter((quest) => quest.status !== "completed" && quest.status !== "failed")
    .map((quest) => {
      const summary = byId[quest.id];
      const gaps = summary?.prepGapCount ?? 0;
      const loot = summary?.undispatchedLootCount ?? 0;
      if (gaps) {
        return { quest, count: gaps, reason: `${gaps} beat${gaps === 1 ? "" : "s"} not ready to run`, rank: 0 };
      }
      if (loot) {
        return { quest, count: loot, reason: `${loot} reward${loot === 1 ? "" : "s"} never handed out`, rank: 1 };
      }
      return null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.rank - b.rank || b.count - a.count);
});
</script>
