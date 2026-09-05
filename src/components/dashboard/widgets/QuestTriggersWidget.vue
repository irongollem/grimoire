<template>
  <DashboardWidget
    title="Quest consequences due"
    tone="caution"
    :count="rows.length || null"
    to="/quests"
    action-label="Quest log →"
    :loading="isLoading"
    :empty="!isLoading && !rows.length"
    empty-text="Nothing about to fire."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.eventId"
        :to="`/quests/${row.questId}`"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.questTitle }}
          </p>
          <p class="truncate text-caption text-muted-foreground italic">{{ row.waitingFor }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="formatDaysUntil(row.daysUntil)"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import { formatDaysUntil, type CalendarToday } from "@/lib/calendar/upcoming";
import { deriveDueConsequenceRows, type ConsequenceEventRow } from "@/lib/dashboard/questTriggers";
import AppButton from "@/components/common/AppButton.vue";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Delayed quest consequences about to fire (#764, reworked for #794). See
 * `questTriggers.ts` for what "about to fire" means now that one engine
 * (`quest_consequences`/`quest_consequence_events`) replaced the old
 * trigger/objective-effect split.
 *
 * Queried straight off the log rather than through a shared composable: no
 * other surface needs "pending world-action events, joined to their quest," and
 * `useQuestConsequences` (useQuestFlow.ts) is quest-scoped, not campaign-wide.
 *
 * No props: like every other list widget on the dashboard, it reads the
 * active campaign off the store through its own query.
 */

const PENDING_KEY = "quest_consequence_events";

const campaign = useCampaignStore();
// The campaign's own calendar, so the countdown agrees with the engine and
// with `useDueConsequences` — both go through `dayMath` since #766.
const calendarStore = useCalendarStore();
const campaignId = computed(() => campaign.activeCampaignId);

const { data: rawRows, isLoading } = useQuery({
  queryKey: computed(() => [PENDING_KEY, campaignId.value, "due-widget"]),
  queryFn: async () => {
    const { data, error } = await supabase
      .from("quest_consequence_events")
      .select(
        "id, after_days, fires_on_year, fires_on_month, fires_on_day, action, action_payload, " +
          "quest:quests(id, title)",
      )
      .eq("campaign_id", campaignId.value!)
      .is("performed_at", null)
      .is("undone_at", null)
      .in("action", ["create_calendar_event", "send_broadcast"]);
    if (error) throw error;
    return data as unknown as ConsequenceEventRow[];
  },
  enabled: () => !!campaignId.value,
});

const today = computed<CalendarToday>(() => ({
  year: campaign.todayYear,
  month: campaign.todayMonth,
  day: campaign.todayDay,
}));

// `rawRows.value === undefined` while the query is loading (or has no active
// campaign) -- that is "nothing to show yet", not "checked and found zero
// due consequences", so this stays empty rather than lying with `?? []`.
// `isLoading` above is what actually tells `DashboardWidget` which of those
// two states this is; the template's `:loading`/`:empty` never read `rows`
// itself for that distinction.
const rows = computed(() => {
  if (rawRows.value === undefined) return [];
  return deriveDueConsequenceRows(calendarStore.adapter, rawRows.value, today.value);
});
</script>
