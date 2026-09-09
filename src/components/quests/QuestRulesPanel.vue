<template>
  <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Quest consequences">
    <div>
      <h3 class="font-cinzel text-sm font-bold text-foreground">Consequences</h3>
      <p class="text-caption text-muted-foreground">
        When an objective becomes a status, the whole ledger settles, or a place gains a fact, do this — optionally after a delay.
      </p>
    </div>

    <ul v-if="rows.length" class="space-y-1.5">
      <li v-for="row in rows" :key="row.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border p-2 text-caption">
        <IconLightning v-if="isWorldAction(row.action)" class="h-3.5 w-3.5 text-primary shrink-0" />
        <span v-else class="rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground" :class="ACTION_TONES[row.action]">{{ ACTION_LABELS[row.action] }}</span>
        <QuestObjectiveStatusMark v-if="isLedgerAction(row.action) && objectiveFor(row.target_objective_id)" :status="objectiveFor(row.target_objective_id)!.status" />
        <span class="min-w-0 flex-1 truncate text-foreground">{{ actionSummary(row) }}</span>
        <span class="truncate text-muted-foreground">{{ conditionLabel(row) }}{{ delaySuffix(row) }}</span>
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === row.id" @click="remove(row.id)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">No quest-wide consequences yet.</p>

    <div class="grid min-w-0 gap-2 sm:grid-cols-2">
      <!-- Condition -->
      <AppSelect v-model="conditionKind" class="min-w-0" aria-label="Condition" @change="conditionObjectiveId = ''; conditionLocationId = ''">
        <option value="settled">When the quest settles</option>
        <option value="objective">When an objective becomes…</option>
        <option value="location">When a place…</option>
      </AppSelect>
      <template v-if="conditionKind === 'objective'">
        <EntityCombobox v-model="conditionObjectiveId" class="min-w-0" :options="objectiveOptions" placeholder="Which objective…" />
        <AppSelect v-model="conditionObjectiveStatus" class="min-w-0 sm:col-span-2" aria-label="Becomes">
          <option v-for="status in QUEST_CONSEQUENCE_OBJECTIVE_STATUSES" :key="status" :value="status">…becomes {{ QUEST_OBJECTIVE_STATUS_LABELS[status] }}</option>
        </AppSelect>
      </template>
      <template v-else-if="conditionKind === 'location'">
        <!-- Any location, not just sites — a district or a room can be
             cleared too (design frame 15). -->
        <EntityCombobox v-model="conditionLocationId" class="min-w-0" :options="locationOptions" placeholder="Which place…">
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${opt.depth * 0.75}rem` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>
        <AppSelect v-model="conditionLocationFact" class="min-w-0 sm:col-span-2" aria-label="Gains the fact">
          <option v-for="fact in QUEST_CONSEQUENCE_LOCATION_FACTS" :key="fact" :value="fact">…is {{ QUEST_CONSEQUENCE_LOCATION_FACT_LABELS[fact].toLowerCase() }}</option>
        </AppSelect>
      </template>

      <!-- Delay -->
      <div class="flex items-center gap-1 sm:col-span-2">
        <AppInput v-model.number="afterDays" type="number" min="0" size="body-xs" :block="false" class="w-16" />
        <span class="text-caption text-muted-foreground">days later →</span>
      </div>

      <!-- Action -->
      <AppSelect v-model="action" class="min-w-0 sm:col-span-2" aria-label="What it does" @change="targetObjectiveId = ''">
        <optgroup label="Objective">
          <option v-for="verb in QUEST_CONSEQUENCE_LEDGER_ACTIONS" :key="verb" :value="verb">{{ ACTION_LABELS[verb] }}</option>
        </optgroup>
        <optgroup label="World">
          <option v-for="verb in QUEST_CONSEQUENCE_WORLD_ACTIONS" :key="verb" :value="verb">{{ ACTION_LABELS[verb] }}</option>
        </optgroup>
      </AppSelect>

      <template v-if="isLedgerAction(action)">
        <EntityCombobox v-if="targetOptions.length" v-model="targetObjectiveId" class="min-w-0 sm:col-span-2" :options="targetOptions" placeholder="Which objective…" />
        <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">Add an objective on the quest overview first.</p>
      </template>
      <template v-else-if="action === 'create_calendar_event'">
        <AppInput v-model="calendarTitle" size="body-xs" placeholder="Event title…" class="sm:col-span-2" />
        <AppSelect v-model="calendarType" class="min-w-0 sm:col-span-2">
          <option v-for="t in CALENDAR_EVENT_TYPES" :key="t" :value="t">{{ t }}</option>
        </AppSelect>
      </template>
      <template v-else-if="action === 'shift_npc_relationship'">
        <EntityCombobox v-if="npcOptions.length" v-model="targetNpcId" class="min-w-0 sm:col-span-2" :options="npcOptions" placeholder="Which NPC…" />
        <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">No NPCs in this campaign yet.</p>
        <AppSelect v-if="npcOptions.length" v-model="relationshipShiftKey" class="min-w-0 sm:col-span-2" aria-label="What happens to their stance">
          <option v-for="option in RELATIONSHIP_SHIFT_OPTIONS" :key="option.key" :value="option.key">{{ option.label }}</option>
        </AppSelect>
      </template>
      <template v-else-if="action === 'unlock_quest'">
        <EntityCombobox v-if="unlockableQuestOptions.length" v-model="targetQuestId" class="min-w-0 sm:col-span-2" :options="unlockableQuestOptions" placeholder="Which quest…" />
        <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">
          No undiscovered quests to unlock — write the sequel first and leave it undiscovered.
        </p>
        <template v-if="targetQuestId">
          <EntityCombobox v-if="entryBeatOptions.length" v-model="entryBeatId" class="min-w-0 sm:col-span-2" :options="entryBeatOptions" placeholder="Enters at…" />
          <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">This quest has no beats yet — it will open at whichever beat is written first.</p>
        </template>
      </template>
      <template v-else-if="action === 'grant_knowledge'">
        <AppInput v-model="knowledgeText" size="body-xs" placeholder="What do the players learn…" class="sm:col-span-2" />
      </template>
      <template v-else-if="action === 'owe_favor'">
        <EntityCombobox v-if="npcOptions.length" v-model="targetNpcId" class="min-w-0 sm:col-span-2" :options="npcOptions" placeholder="Which NPC…" />
        <p v-else class="text-caption italic text-muted-foreground sm:col-span-2">No NPCs in this campaign yet.</p>
        <AppInput v-if="npcOptions.length" v-model="favorText" size="body-xs" placeholder="What do they owe the party…" class="sm:col-span-2" />
      </template>
      <template v-else-if="action === 'award_milestone'">
        <AppInput v-model="milestoneText" size="body-xs" placeholder="What did the party earn…" class="sm:col-span-2" />
      </template>
      <template v-else>
        <AppInput v-model="broadcastMessage" size="body-xs" placeholder="Broadcast message…" class="sm:col-span-2" />
      </template>

      <div class="sm:col-span-2 flex justify-end">
        <AppButton label="Add" size="sm" :disabled="!canAdd" :loading="adding" @click="add" />
      </div>
    </div>

    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  useCreateQuestConsequence,
  useDeleteQuestConsequence,
  useQuestConsequences,
} from "@/composables/quests/useQuestFlow";
import { useQuestObjectives, useQuests } from "@/composables/quests/useQuests";
import { useUnlockEntryPicker } from "@/composables/quests/useUnlockEntryPicker";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useLocationTree } from "@/composables/locations/useLocations";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import {
  QUEST_CONSEQUENCE_LEDGER_ACTIONS,
  QUEST_CONSEQUENCE_LOCATION_FACT_LABELS,
  QUEST_CONSEQUENCE_LOCATION_FACTS,
  QUEST_CONSEQUENCE_OBJECTIVE_STATUSES,
  QUEST_CONSEQUENCE_WORLD_ACTIONS,
  type QuestConsequence,
  type QuestConsequenceAction,
  type QuestConsequenceActionPayload,
  type QuestConsequenceInsert,
  type QuestConsequenceObjectiveStatus,
} from "@/types/quest.types";
import type { LocationStateFact } from "@/types/locationState.types";
import { EVENT_TYPE_COLORS, type CalendarEventType } from "@/types/calendar.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconLightning } from "@/lib/icons";
import { DEFAULT_RELATIONSHIP_SHIFT_KEY, RELATIONSHIP_SHIFT_OPTIONS, describeQuestConsequenceAction, isLedgerConsequenceAction, QUEST_CONSEQUENCE_ACTION_LABELS, relationshipShiftPayload } from "@/lib/quests/consequences";
import QuestObjectiveStatusMark from "./QuestObjectiveStatusMark.vue";

/**
 * The quest-wide half of the one consequence editor (#794): rules that fire
 * when an objective becomes a status, when the whole ledger settles, or
 * (#869) when a place gains a durable fact (explored/cleared/looted) — the
 * honest version of the DM ticking a box twice, per frame 15 of the site
 * sheet. Mounted once, on the quest overview (`QuestOverviewLifecycle`).
 *
 * The beat-scoped half — arrival and branch conditions, authored on a beat —
 * moved into the Payoff list on the beat page (`QuestPayoffPanel.vue`,
 * Quest Manager Redesign frame `03 Inspector`) when the loot panel and this
 * editor's beat scope folded into one "what this beat gives" list. This file
 * used to be `QuestConsequencesPanel.vue` and take a `scope` prop; there is
 * now exactly one scope, so the prop and its beat-only branches are gone
 * rather than kept as dead code paths nothing selects anymore.
 *
 * Both scopes still share the same action half: the four ledger verbs and the
 * two world actions, plus the delay field — `quest_triggers` and
 * `quest_objective_effects` used to split that in half by scope; one table,
 * one editor now.
 */
const { questId } = defineProps<{ questId: string }>();

const CALENDAR_EVENT_TYPES = Object.keys(EVENT_TYPE_COLORS) as CalendarEventType[];

const ACTION_LABELS = QUEST_CONSEQUENCE_ACTION_LABELS;

// Phrased as what happens at the table, not as a state transition, because
// the DM is describing a story consequence and will read this list back
// mid-session.
const ACTION_TONES: Record<QuestConsequenceAction, string> = {
  raise: "text-tone-info",
  reveal: "text-primary",
  complete: "text-tone-success",
  fail: "text-destructive",
  create_calendar_event: "text-tone-info",
  send_broadcast: "text-tone-info",
  // Signed, so it gets a neutral tone rather than success or destructive —
  // the same rule read either way depending on the step.
  shift_npc_relationship: "text-tone-info",
  unlock_quest: "text-primary",
  grant_knowledge: "text-tone-info",
  owe_favor: "text-tone-info",
  award_milestone: "text-primary",
};

const isLedgerAction = isLedgerConsequenceAction;
function isWorldAction(a: QuestConsequenceAction): boolean {
  return QUEST_CONSEQUENCE_WORLD_ACTIONS.includes(a);
}

const { data: objectives } = useQuestObjectives(computed(() => questId));
const consequencesQuery = useQuestConsequences(computed(() => questId));
const createConsequence = useCreateQuestConsequence();
const deleteConsequence = useDeleteQuestConsequence();
const { locationOptions: locationTreeOptions } = useLocationTree();
// Any location, not just sites — a district or a room can be cleared too
// (design frame 15). Wrapped in its own computed, like every other option
// list here, rather than binding the composable's ref straight to the
// template.
const locationOptions = computed(() => locationTreeOptions.value);

// Objective-became, quest-settled and location-fact rules only — a beat/edge
// rule from the flow lives in the Payoff list instead.
const rows = computed(() => (consequencesQuery.data.value ?? [])
  .filter((row) => row.on_objective_id !== null || row.on_quest_settled || row.on_location_id !== null));

const objectiveOptions = computed(() => (objectives.value ?? []).map((objective) => ({ id: objective.id, name: objective.description })));
function objectiveFor(id: string | null) {
  if (!id) return undefined;
  return (objectives.value ?? []).find((objective) => objective.id === id);
}
function objectiveLabel(id: string | null): string {
  if (!id) return "";
  return objectiveFor(id)?.description ?? "Objective removed";
}

// A location fact's `on_location_id` cascades on delete (the migration's own
// FK), so "removed" is not a real state here the way it is for an objective —
// only ever a loading gap before `locationOptions` has fetched.
function locationLabel(id: string | null): string {
  if (!id) return "";
  return locationOptions.value.find((location) => location.id === id)?.name ?? "Unknown place";
}

// ── Condition form ───────────────────────────────────────────────────────────

const conditionKind = ref<"settled" | "objective" | "location">("settled");
const conditionObjectiveId = ref("");
const conditionObjectiveStatus = ref<QuestConsequenceObjectiveStatus>("complete");
const conditionLocationId = ref("");
const conditionLocationFact = ref<LocationStateFact>("cleared");

// ── Action form ──────────────────────────────────────────────────────────────

const action = ref<QuestConsequenceAction>("complete");
const targetObjectiveId = ref("");
const afterDays = ref(0);
const calendarTitle = ref("");
const calendarType = ref<string>("quest");
const broadcastMessage = ref("");
const targetNpcId = ref("");
const relationshipShiftKey = ref(DEFAULT_RELATIONSHIP_SHIFT_KEY);
const targetQuestId = ref("");
const knowledgeText = ref("");
const favorText = ref("");
const milestoneText = ref("");
const adding = ref(false);
const removingId = ref("");
const error = ref("");

const { data: npcs } = useNpcs();
const npcOptions = computed(() =>
  (npcs.value ?? []).map((npc) => ({ id: npc.id, name: npc.name })),
);

// Only `undiscovered` quests, because that is the only rung an unlock moves —
// promoting anything else would be a rule that silently never fires. The quest
// being edited is excluded too: `quest_consequences_no_self_unlock` refuses it,
// and offering an option the database rejects is worse than not offering it.
const { data: undiscoveredQuests } = useQuests("undiscovered");
const unlockableQuestOptions = computed(() =>
  (undiscoveredQuests.value ?? [])
    .filter((quest) => quest.id !== questId)
    .map((quest) => ({ id: quest.id, name: quest.title })),
);

// "Enters at" (#871) — see useUnlockEntryPicker for the shared mechanism.
const {
  entryBeatId, entryBeatOptions, unlockQuestLabel, unlockBeatLabel, resolveEntryBeatId,
  reset: resetEntryBeatPicker,
} = useUnlockEntryPicker({
  targetQuestId,
  fallbackTargetQuestId: () => rows.value.find((row) => row.action === "unlock_quest" && row.target_quest_id)?.target_quest_id ?? "",
});

// A ledger verb cannot target the same objective its own condition names —
// the database's no-self-reference check — so that objective is dropped from
// the target picker rather than offered and then rejected.
const targetOptions = computed(() => {
  if (conditionKind.value === "objective" && conditionObjectiveId.value) {
    return objectiveOptions.value.filter((option) => option.id !== conditionObjectiveId.value);
  }
  return objectiveOptions.value;
});

watch(targetOptions, (options) => {
  if (targetObjectiveId.value && !options.some((option) => option.id === targetObjectiveId.value)) targetObjectiveId.value = "";
});

const canAdd = computed(() => {
  if (conditionKind.value === "objective" && !conditionObjectiveId.value) return false;
  if (conditionKind.value === "location" && !conditionLocationId.value) return false;
  if (isLedgerAction(action.value)) return !!targetObjectiveId.value;
  if (action.value === "create_calendar_event") return !!calendarTitle.value.trim();
  if (action.value === "shift_npc_relationship") return !!targetNpcId.value && relationshipShiftPayload(relationshipShiftKey.value) !== null;
  if (action.value === "unlock_quest") return !!targetQuestId.value;
  if (action.value === "grant_knowledge") return !!knowledgeText.value.trim();
  if (action.value === "owe_favor") return !!targetNpcId.value && !!favorText.value.trim();
  if (action.value === "award_milestone") return !!milestoneText.value.trim();
  return !!broadcastMessage.value.trim();
});

// ── Display ──────────────────────────────────────────────────────────────────

function conditionLabel(row: QuestConsequence): string {
  if (row.on_quest_settled) return "when the quest settles";
  if (row.on_location_id) return `when "${locationLabel(row.on_location_id)}" is ${QUEST_CONSEQUENCE_LOCATION_FACT_LABELS[row.on_location_fact!].toLowerCase()}`;
  return `when "${objectiveLabel(row.on_objective_id)}" becomes ${QUEST_OBJECTIVE_STATUS_LABELS[row.on_objective_status!].toLowerCase()}`;
}

function delaySuffix(row: QuestConsequence): string {
  return row.after_days > 0 ? ` (+${row.after_days}d)` : "";
}

function actionSummary(row: QuestConsequence): string {
  return describeQuestConsequenceAction(row, objectiveLabel, { questLabel: unlockQuestLabel, beatLabel: unlockBeatLabel });
}

// ── Mutations ────────────────────────────────────────────────────────────────

function resetForm() {
  conditionKind.value = "settled";
  conditionObjectiveId.value = "";
  conditionLocationId.value = "";
  conditionLocationFact.value = "cleared";
  targetObjectiveId.value = "";
  afterDays.value = 0;
  calendarTitle.value = "";
  broadcastMessage.value = "";
  targetNpcId.value = "";
  relationshipShiftKey.value = DEFAULT_RELATIONSHIP_SHIFT_KEY;
  targetQuestId.value = "";
  resetEntryBeatPicker();
  knowledgeText.value = "";
  favorText.value = "";
  milestoneText.value = "";
}

async function add() {
  if (!canAdd.value) return;
  adding.value = true;
  error.value = "";
  try {
    const payload: QuestConsequenceActionPayload = action.value === "create_calendar_event"
      ? { title: calendarTitle.value.trim(), event_type: calendarType.value }
      : action.value === "send_broadcast"
        ? { message: broadcastMessage.value.trim() }
        : action.value === "shift_npc_relationship"
          ? relationshipShiftPayload(relationshipShiftKey.value)!
          : action.value === "grant_knowledge"
            ? { text: knowledgeText.value.trim() }
            : action.value === "owe_favor"
              ? { text: favorText.value.trim() }
              : action.value === "award_milestone"
                ? { text: milestoneText.value.trim() }
                : {};
    const insert: QuestConsequenceInsert = {
      quest_id: questId,
      on_beat_id: null,
      on_edge_id: null,
      on_objective_id: conditionKind.value === "objective" ? conditionObjectiveId.value : null,
      on_objective_status: conditionKind.value === "objective" ? conditionObjectiveStatus.value : null,
      on_quest_settled: conditionKind.value === "settled",
      on_location_id: conditionKind.value === "location" ? conditionLocationId.value : null,
      on_location_fact: conditionKind.value === "location" ? conditionLocationFact.value : null,
      after_days: afterDays.value || 0,
      action: action.value,
      target_objective_id: isLedgerAction(action.value) ? targetObjectiveId.value : null,
      target_npc_id: action.value === "shift_npc_relationship" || action.value === "owe_favor" ? targetNpcId.value : null,
      target_quest_id: action.value === "unlock_quest" ? targetQuestId.value : null,
      entry_beat_id: action.value === "unlock_quest" ? resolveEntryBeatId() : null,
      action_payload: payload,
    };
    await createConsequence.mutateAsync(insert);
    resetForm();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not add this consequence";
  } finally {
    adding.value = false;
  }
}

async function remove(id: string) {
  removingId.value = id;
  error.value = "";
  try { await deleteConsequence.mutateAsync({ id, questId }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not remove this consequence"; }
  finally { removingId.value = ""; }
}
</script>
