<template>
  <!-- #878 S3 "hang a quest outcome on a room, from the site" — the #869
       location-fact rule engine (`quest_consequences.on_location_id` +
       `on_location_fact`), authored from the room itself rather than only
       from the quest's own Consequences panel (`QuestRulesPanel.vue`). A DM
       tracing the Reliquary can now say "Cleared → complete objective
       Recover the relic" standing right there, instead of finding the room
       again in a campaign-wide combobox on the quest page.

       Ledger verbs only (raise/reveal/complete/fail on an objective).
       `QuestRulesPanel.vue` also lets a location condition drive any of the
       seven world actions (calendar events, NPC shifts/favours, quest
       unlocks, knowledge, milestones) — reproducing all of those forms here
       too would duplicate roughly half that file's markup with no shared
       component to route both through, and that file is off limits this
       story. A DM who wants one of those for a room-fact condition still has
       it on the quest's own overview; this surface covers the case the
       complaint actually named. `after_days` is skipped for the same reason
       it would be inert here: a ledger verb "applies immediately regardless"
       of the delay column (`QuestConsequence.after_days`'s own doc) — only
       the two original world actions ever honoured it. -->
  <div class="flex flex-col gap-1.5 border-t border-border pt-1.5">
    <p class="text-caption font-semibold text-muted-foreground">Quest rules on this room</p>

    <ul v-if="rules.length" class="flex flex-col gap-1">
      <li
        v-for="rule in rules"
        :key="rule.id"
        class="flex min-w-0 flex-wrap items-center gap-1.5 rounded border border-border px-2 py-1 text-caption"
      >
        <span class="truncate font-semibold text-foreground">{{ questLabel(rule.quest_id) }}</span>
        <span class="shrink-0 text-muted-foreground">— when {{ factLabel(rule) }} →</span>
        <span class="min-w-0 flex-1 truncate text-foreground">{{ actionSummary(rule) }}{{ delaySuffix(rule) }}</span>
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === rule.id" @click="remove(rule)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">No quest rules on this room yet.</p>

    <div class="grid min-w-0 gap-1.5 sm:grid-cols-2">
      <template v-if="questOptions.length">
        <EntityCombobox v-model="ruleQuestId" class="min-w-0" :options="questOptions" placeholder="Which quest…" />
      </template>
      <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">No quests in this campaign yet — write one first.</p>

      <AppSelect v-model="ruleFact" size="xs" tone="card" aria-label="When this room is">
        <option v-for="fact in QUEST_CONSEQUENCE_LOCATION_FACTS" :key="fact" :value="fact">When {{ QUEST_CONSEQUENCE_LOCATION_FACT_LABELS[fact].toLowerCase() }}</option>
      </AppSelect>
      <AppSelect v-model="ruleAction" size="xs" tone="card" aria-label="Do this">
        <option v-for="verb in QUEST_CONSEQUENCE_LEDGER_ACTIONS" :key="verb" :value="verb">{{ ACTION_LABELS[verb] }}</option>
      </AppSelect>

      <template v-if="ruleQuestId">
        <EntityCombobox v-if="objectiveOptions.length" v-model="ruleObjectiveId" class="min-w-0" :options="objectiveOptions" placeholder="Which objective…" />
        <p v-else class="text-caption italic text-muted-foreground">This quest has no objectives yet — add one on its overview first.</p>
      </template>
      <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">Choose a quest first.</p>

      <div class="sm:col-span-2 flex justify-end">
        <AppButton label="Add rule" size="sm" :disabled="!canAdd" :loading="adding" @click="add" />
      </div>
    </div>

    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The room-scoped half of the #869 location-fact rule editor — split out of
 * `SiteMapRegionList.vue` per CLAUDE.md's component-granularity rule rather
 * than grown inline, since this is a full list + form, not a couple of
 * fields. Mounted once per bound space row, only while that row's "Rules"
 * toggle is open and only in Build (the caller gates both).
 *
 * `rules` arrives pre-filtered to this room by the caller, which fetches
 * every bound space's rules in one batched query
 * (`useQuestConsequencesByLocations`, mirroring the site map's other
 * plural-lookup composables) rather than this component querying per row.
 */
import { computed, ref } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { CONSEQUENCES_BY_LOCATIONS_KEY, useCreateQuestConsequence, useDeleteQuestConsequence } from "@/composables/quests/useQuestFlow";
import { useQuestObjectives, useQuests } from "@/composables/quests/useQuests";
import { describeQuestConsequenceAction, QUEST_CONSEQUENCE_ACTION_LABELS } from "@/lib/quests/consequences";
import {
  QUEST_CONSEQUENCE_LEDGER_ACTIONS,
  QUEST_CONSEQUENCE_LOCATION_FACT_LABELS,
  QUEST_CONSEQUENCE_LOCATION_FACTS,
  type QuestConsequence,
  type QuestConsequenceAction,
  type QuestConsequenceInsert,
  type QuestObjective,
} from "@/types/quest.types";
import type { LocationStateFact } from "@/types/locationState.types";

const { locationId, rules } = defineProps<{
  /** This room's own location id — `space.id` in `SiteMapRegionList`, always
   *  a bound space (a room or a nested site), never a zone (see that file's
   *  own comment on why a zone can't reach this component at all). */
  locationId: string;
  /** This room's `quest_consequences` rows, already filtered by
   *  `on_location_id` by the caller. */
  rules: QuestConsequence[];
}>();

const ACTION_LABELS = QUEST_CONSEQUENCE_ACTION_LABELS;

// ── Existing rules — display ────────────────────────────────────────────────

const { data: quests } = useQuests();
function questLabel(id: string): string {
  return quests.value?.find((q) => q.id === id)?.title ?? "Quest removed";
}

// A room's rules can come from more than one quest (each authored on its own
// quest's Consequences panel, or from this editor across several sessions),
// so the single-quest `useQuestObjectives` the add-form below uses for its
// own picker can't resolve every existing row's objective name — this is a
// small batched lookup across whichever quests are actually represented here.
const ruleQuestIds = computed(() => Array.from(new Set(rules.map((r) => r.quest_id))));
const { data: labelObjectives } = useQuery({
  queryKey: computed(() => ["quest_objectives_for_room_rules", ruleQuestIds.value]),
  queryFn: async (): Promise<Pick<QuestObjective, "id" | "quest_id" | "description">[]> => {
    if (!ruleQuestIds.value.length) return [];
    const { data, error } = await supabase
      .from("quest_objectives")
      .select("id, quest_id, description")
      .in("quest_id", ruleQuestIds.value);
    if (error) throw error;
    return data as Pick<QuestObjective, "id" | "quest_id" | "description">[];
  },
  enabled: () => ruleQuestIds.value.length > 0,
});
function objectiveLabel(id: string | null): string {
  if (!id) return "";
  return labelObjectives.value?.find((o) => o.id === id)?.description ?? "Objective removed";
}

// Every row here came back from a query filtered on `on_location_id`, and the
// database's one-condition CHECK pairs that with a non-null `on_location_fact`
// — so this is always set, unlike the "not yet loaded" gap a location picked
// by id elsewhere has to guard against.
function factLabel(rule: QuestConsequence): string {
  return QUEST_CONSEQUENCE_LOCATION_FACT_LABELS[rule.on_location_fact!].toLowerCase();
}
function actionSummary(rule: QuestConsequence): string {
  // No quest/beat resolver passed: every rule this editor can *create* is a
  // ledger verb, which never needs one, and a pre-existing `unlock_quest` row
  // authored elsewhere degrades to the bare "Unlock a quest" label rather
  // than a wrong name — the documented behaviour of an absent resolver.
  return describeQuestConsequenceAction(rule, objectiveLabel);
}
function delaySuffix(rule: QuestConsequence): string {
  return rule.after_days > 0 ? ` (+${rule.after_days}d)` : "";
}

// ── Add form ─────────────────────────────────────────────────────────────────

const questOptions = computed(() => (quests.value ?? []).map((q) => ({ id: q.id, name: q.title })));
const ruleQuestId = ref("");
const ruleFact = ref<LocationStateFact>("cleared");
const ruleAction = ref<QuestConsequenceAction>("complete");
const ruleObjectiveId = ref("");
const adding = ref(false);
const removingId = ref("");
const error = ref("");

const { data: formObjectives } = useQuestObjectives(ruleQuestId);
const objectiveOptions = computed(() => (formObjectives.value ?? []).map((o) => ({ id: o.id, name: o.description })));

const canAdd = computed(() => !!ruleQuestId.value && !!ruleObjectiveId.value);

const queryClient = useQueryClient();
const createConsequence = useCreateQuestConsequence();
const deleteConsequence = useDeleteQuestConsequence();

async function add(): Promise<void> {
  if (!canAdd.value) return;
  adding.value = true;
  error.value = "";
  try {
    const insert: QuestConsequenceInsert = {
      quest_id: ruleQuestId.value,
      on_beat_id: null,
      on_edge_id: null,
      on_objective_id: null,
      on_objective_status: null,
      on_quest_settled: false,
      on_location_id: locationId,
      on_location_fact: ruleFact.value,
      after_days: 0,
      action: ruleAction.value,
      target_objective_id: ruleObjectiveId.value,
      target_npc_id: null,
      target_quest_id: null,
      entry_beat_id: null,
      action_payload: {},
    };
    await createConsequence.mutateAsync(insert);
    // `useCreateQuestConsequence` only invalidates the per-quest branch of the
    // cache; this panel reads the by-location branch, which needs its own
    // invalidation (see `CONSEQUENCES_BY_LOCATIONS_KEY`'s own comment).
    await queryClient.invalidateQueries({ queryKey: CONSEQUENCES_BY_LOCATIONS_KEY });
    ruleObjectiveId.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not add this rule";
  } finally {
    adding.value = false;
  }
}

async function remove(rule: QuestConsequence): Promise<void> {
  removingId.value = rule.id;
  error.value = "";
  try {
    await deleteConsequence.mutateAsync({ id: rule.id, questId: rule.quest_id });
    await queryClient.invalidateQueries({ queryKey: CONSEQUENCES_BY_LOCATIONS_KEY });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not remove this rule";
  } finally {
    removingId.value = "";
  }
}
</script>
