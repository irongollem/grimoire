<template>
  <DashboardWidget
    title="Recent quest activity"
    :count="rows.length || null"
    to="/quests"
    action-label="Quest log →"
    :loading="isLoading"
    :empty="!isLoading && !rows.length"
    empty-text="No beats played yet. This fills in once a session moves the story."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.transitionId"
        :to="`/quests/${row.questId}?view=work`"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.questTitle }}
          </p>
          <p class="truncate text-caption italic text-muted-foreground">{{ row.summary }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="neutral"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="timeAgo(row.occurredAt)"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { useQuests } from "@/composables/quests/useQuests";
import { useQuestBeatTransitions } from "@/composables/quests/useQuestFlow";
import { deriveQuestActivityRows } from "@/lib/dashboard/questActivity";
import { timeAgo } from "@/lib/utils";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Beat-to-beat "what happened last session" feed (#764), read from the quest
 * transition audit trail that `useQuestBeatTransitions` already exposes and
 * that nothing on the dashboard had read before now. `questActivity.ts` owns
 * the join against live quests, the newest-first order, the row limit and the
 * wording — see that module for what already existed to reuse (nothing did)
 * and why a transition whose quest has since been deleted is dropped rather
 * than shown.
 *
 * No props: like every other list widget on the dashboard, it reads the
 * active campaign off the store through its own composables.
 */
const { data: transitions, isLoading: transitionsLoading } = useQuestBeatTransitions();
const { data: quests, isLoading: questsLoading } = useQuests();

// `isLoading` from useQuery, not `data === undefined` — a query that errored
// also leaves `data` undefined but is no longer loading, and this widget has
// no error state of its own to show, so it should stop spinning rather than
// spin forever. Loading is deliberately never derived from `data`'s presence.
const isLoading = computed(() => transitionsLoading.value || questsLoading.value);

const rows = computed(() => {
  // Guarded rather than defaulted with `?? []`: while either query is still
  // unsettled there is nothing to join yet — that is "no rows to show,"
  // which `isLoading` above already tells the card apart from "joined the
  // data and found zero recent activity."
  if (transitions.value === undefined || quests.value === undefined) return [];
  return deriveQuestActivityRows(transitions.value, quests.value);
});
</script>
