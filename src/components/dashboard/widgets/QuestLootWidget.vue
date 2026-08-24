<template>
  <DashboardWidget
    title="Unclaimed loot"
    tone="caution"
    :count="rows.length || null"
    to="/quests"
    action-label="Quest log →"
    :loading="isLoading"
    :empty="!isLoading && !rows.length"
    empty-text="No quest reward is sitting unclaimed."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.questId"
        :to="`/quests/${row.questId}?view=work`"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <p class="min-w-0 flex-1 truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {{ row.questTitle }}
        </p>
        <!--
          Two badges, never one summed count — undispatchedCount and
          unclaimedCount mean different things (see questLoot.ts) and adding
          them together would ask the DM to act on a number that describes
          nothing real. `to drop` is the DM's own action item, so it gets the
          caution tint; `in chat` is already out of the DM's hands and reads
          quieter. Both go through `AppButton variant="tinted"` rather than a
          hand-spelled span — a coloured pill whose colour means something is
          exactly what that variant owns.
        -->
        <AppButton
          v-if="row.undispatchedCount"
          as="span"
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="`${row.undispatchedCount} to drop`"
        />
        <AppButton
          v-if="row.unclaimedCount"
          as="span"
          variant="tinted"
          tone="neutral"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="`${row.unclaimedCount} in chat`"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { useQuests } from "@/composables/useQuests";
import { useQuestBoardSummaries } from "@/composables/useQuestFlow";
import { deriveQuestLootRows } from "@/lib/dashboard/questLoot";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Quest rewards the table earned but never actually received (#764).
 *
 * `QuestBoardSummary` (src/lib/quests/board.ts) has computed
 * `undispatchedLootCount` and `unclaimedLootCount` for every quest since the
 * board shipped, and nothing outside the board itself ever read either field
 * — this widget is that missing reader. The join and the sort live in
 * `questLoot.ts` as a pure function so the "two different pendings, never
 * summed" rule is unit-tested once rather than re-derived by eye here.
 *
 * No props: like every other list widget on the dashboard, it reads the
 * active campaign off the store through its own composables.
 */
const { data: quests, isLoading: questsLoading } = useQuests();
const { data: summaries, isLoading: summariesLoading } = useQuestBoardSummaries();

// `isLoading` from useQuery, not `data === undefined` — a query that errored
// also leaves `data` undefined but is no longer loading, and this widget has
// no error state of its own to show, so it should stop spinning rather than
// spin forever. Loading is deliberately never derived from `data`'s presence.
const isLoading = computed(() => questsLoading.value || summariesLoading.value);

const rows = computed(() => {
  // Guarded rather than defaulted with `?? []`/`?? {}`: while either query is
  // still loading (or has errored without data), there is nothing to join yet
  // — that state is "no rows to show", which is different from "joined the
  // data and found zero pending loot". `isLoading` above is what tells the
  // card which of those two it actually is.
  if (quests.value === undefined || summaries.value === undefined) return [];
  return deriveQuestLootRows(summaries.value, quests.value);
});
</script>
