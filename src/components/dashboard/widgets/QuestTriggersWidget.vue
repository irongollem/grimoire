<template>
  <DashboardWidget
    title="Quest triggers due"
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
        :key="row.scheduledId"
        :to="`/quests/${row.questId}`"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.questTitle }}
          </p>
          <p class="truncate text-caption text-muted-foreground italic">{{ row.waitingFor }}</p>
        </div>
        <!-- A `time` row's countdown is the point of this widget: a fire date
             closing in is why it needs the DM's eyes. An `event` row's
             daysUntil is always <= 0 (see questTriggers.ts), so
             `formatDaysUntil` reads it as "Today" -- which is the accurate
             answer for something that fires the instant the DM advances the
             calendar, and needs no separate label of its own. -->
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
import { formatDaysUntil, type CalendarToday } from "@/lib/calendar/upcoming";
import { deriveQuestTriggerDueRows, type ScheduledTriggerRow } from "@/lib/dashboard/questTriggers";
import AppButton from "@/components/common/AppButton.vue";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Scheduled quest consequences about to fire -- time-delayed and
 * immediate alike (#764). See `questTriggers.ts` for what "about to fire"
 * means and why one widget covers both.
 *
 * No composable already returns the scheduled rows themselves --
 * `usePendingTriggerCount()` (src/composables/useQuests.ts:709) only counts
 * them, for the calendar badge -- and `quest_triggers` carries no
 * `campaign_id` of its own to query by, so the fetch here mirrors
 * `fireDueTriggers`'s own query shape (useQuests.ts:667-668: `select("*,
 * trigger:quest_triggers(*)")`) rather than going through a new composable,
 * extended with the `quest` and `objective` embeds this card also needs so
 * the whole join happens in one round trip.
 *
 * No props: like every other list widget on the dashboard, it reads the
 * active campaign off the store through its own query.
 */

const SCHEDULED_KEY = "quest_trigger_scheduled";

const campaign = useCampaignStore();
const campaignId = computed(() => campaign.activeCampaignId);

// The query key's first element matches the literal string CalendarView.vue
// invalidates after advancing the in-world day (`["quest_trigger_scheduled"]`
// -- TanStack Query invalidates by prefix), so this card refreshes the moment
// triggers actually fire, without this widget needing its own invalidation
// wiring.
const { data: rawRows, isLoading } = useQuery({
  queryKey: computed(() => [SCHEDULED_KEY, campaignId.value, "due-widget"]),
  queryFn: async () => {
    const { data, error } = await supabase
      .from("quest_trigger_scheduled")
      .select(
        "id, fire_year, fire_month, fire_day, fired_at, " +
          "quest:quests(id, title), " +
          "trigger:quest_triggers(trigger_type, offset_days, objective:quest_objectives(description))",
      )
      .eq("campaign_id", campaignId.value!)
      .is("fired_at", null);
    if (error) throw error;
    return data as unknown as ScheduledTriggerRow[];
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
// due triggers", so this stays empty rather than lying with `?? []`.
// `isLoading` above is what actually tells `DashboardWidget` which of those
// two states this is; the template's `:loading`/`:empty` never read `rows`
// itself for that distinction.
const rows = computed(() => {
  if (rawRows.value === undefined) return [];
  return deriveQuestTriggerDueRows(rawRows.value, today.value);
});
</script>
