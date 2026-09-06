<template>
  <section
    class="space-y-2 rounded-lg border border-border bg-card p-3"
    :aria-label="scope === 'beat' ? 'Consequences decided here' : 'Quest consequences'"
  >
    <div>
      <h3 class="font-cinzel text-sm font-bold text-foreground">
        {{ scope === "beat" ? "Consequences decided here" : "Consequences" }}
      </h3>
      <p class="text-caption text-muted-foreground">
        {{ scope === "beat"
          ? "Running the session applies these. Attach one to the beat and it fires on arrival; attach it to a branch and it fires only if the party takes that road."
          : "When an objective becomes a status, or the whole ledger settles, do this — optionally after a delay." }}
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
    <p v-else class="text-caption italic text-muted-foreground">
      {{ scope === "beat" ? "Nothing here changes anything yet." : "No quest-wide consequences yet." }}
    </p>

    <div class="grid min-w-0 gap-2 sm:grid-cols-2">
      <!-- Condition -->
      <template v-if="scope === 'beat'">
        <AppSelect v-model="conditionEdgeId" class="min-w-0 sm:col-span-2" aria-label="When this fires">
          <option value="">On arriving at this beat</option>
          <option v-for="edge in outgoing" :key="edge.id" :value="edge.id">On taking the route to {{ beatTitle(edge.target_beat_id) }}</option>
        </AppSelect>
      </template>
      <template v-else>
        <AppSelect v-model="conditionKind" class="min-w-0" aria-label="Condition" @change="conditionObjectiveId = ''">
          <option value="settled">When the quest settles</option>
          <option value="objective">When an objective becomes…</option>
        </AppSelect>
        <template v-if="conditionKind === 'objective'">
          <EntityCombobox v-model="conditionObjectiveId" class="min-w-0" :options="objectiveOptions" placeholder="Which objective…" />
          <AppSelect v-model="conditionObjectiveStatus" class="min-w-0 sm:col-span-2" aria-label="Becomes">
            <option v-for="status in QUEST_CONSEQUENCE_OBJECTIVE_STATUSES" :key="status" :value="status">…becomes {{ QUEST_OBJECTIVE_STATUS_LABELS[status] }}</option>
          </AppSelect>
        </template>
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
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import {
  QUEST_CONSEQUENCE_LEDGER_ACTIONS,
  QUEST_CONSEQUENCE_OBJECTIVE_STATUSES,
  QUEST_CONSEQUENCE_WORLD_ACTIONS,
  type QuestBeat,
  type QuestBeatEdge,
  type QuestConsequence,
  type QuestConsequenceAction,
  type QuestConsequenceActionPayload,
  type QuestConsequenceInsert,
  type QuestConsequenceObjectiveStatus,
} from "@/types/quest.types";
import { EVENT_TYPE_COLORS, type CalendarEventType } from "@/types/calendar.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconLightning } from "@/lib/icons";
import { describeQuestConsequenceAction, isLedgerConsequenceAction, QUEST_CONSEQUENCE_ACTION_LABELS } from "@/lib/quests/consequences";
import QuestObjectiveStatusMark from "./QuestObjectiveStatusMark.vue";

/**
 * The one consequence editor (#794). Mounted twice, on disjoint rows of the
 * same `quest_consequences` table:
 *
 * - `scope="beat"`, on a beat (inspector + beat page): authors arrival
 *   (`on_beat_id`) and branch (`on_edge_id`) conditions — a beat owns both its
 *   own arrival rule and the rules on every road out of it.
 * - `scope="quest"`, on the quest overview (`QuestOverviewLifecycle`): authors
 *   objective-became (`on_objective_id` + `on_objective_status`) and
 *   quest-settled (`on_quest_settled`) conditions.
 *
 * Both scopes share the same action half: the four ledger verbs and the two
 * world actions, plus the delay field — `quest_triggers` and
 * `quest_objective_effects` used to split that in half by scope; one table,
 * one editor now.
 */
const { scope, questId, beat, edges = [], beats = [] } = defineProps<{
  scope: "beat" | "quest";
  questId: string;
  /** Required (and only meaningful) for `scope="beat"`. */
  beat?: QuestBeat;
  edges?: QuestBeatEdge[];
  /** Named for the target beat title a branch condition now reads instead of
   *  the free-text label that used to be an edge's own field (#795). */
  beats?: QuestBeat[];
}>();

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
};

const isLedgerAction = isLedgerConsequenceAction;
function isWorldAction(a: QuestConsequenceAction): boolean {
  return QUEST_CONSEQUENCE_WORLD_ACTIONS.includes(a);
}

const { data: objectives } = useQuestObjectives(computed(() => questId));
const consequencesQuery = useQuestConsequences(computed(() => questId));
const createConsequence = useCreateQuestConsequence();
const deleteConsequence = useDeleteQuestConsequence();

const outgoing = computed(() => scope === "beat" && beat ? edges.filter((edge) => edge.source_beat_id === beat.id) : []);
const outgoingIds = computed(() => new Set(outgoing.value.map((edge) => edge.id)));

// A beat's rows are its own arrival plus every branch leaving it; a quest's
// rows are everything else — the two lists never overlap.
const rows = computed(() => {
  const all = consequencesQuery.data.value ?? [];
  if (scope === "beat") {
    return all.filter((row) => row.on_beat_id === beat?.id || (row.on_edge_id !== null && outgoingIds.value.has(row.on_edge_id)));
  }
  return all.filter((row) => row.on_objective_id !== null || row.on_quest_settled);
});

const objectiveOptions = computed(() => (objectives.value ?? []).map((objective) => ({ id: objective.id, name: objective.description })));
function objectiveFor(id: string | null) {
  if (!id) return undefined;
  return (objectives.value ?? []).find((objective) => objective.id === id);
}
function objectiveLabel(id: string | null): string {
  if (!id) return "";
  return objectiveFor(id)?.description ?? "Objective removed";
}

function beatTitle(id: string): string {
  return beats.find((row) => row.id === id)?.title || "Missing beat";
}

// ── Condition form ───────────────────────────────────────────────────────────

const conditionEdgeId = ref(""); // "" = arrival at the beat itself (scope="beat")
const conditionKind = ref<"settled" | "objective">("settled"); // scope="quest"
const conditionObjectiveId = ref("");
const conditionObjectiveStatus = ref<QuestConsequenceObjectiveStatus>("complete");

// ── Action form ──────────────────────────────────────────────────────────────

const action = ref<QuestConsequenceAction>("complete");
const targetObjectiveId = ref("");
const afterDays = ref(0);
const calendarTitle = ref("");
const calendarType = ref<string>("quest");
const broadcastMessage = ref("");
const adding = ref(false);
const removingId = ref("");
const error = ref("");

// A ledger verb cannot target the same objective its own condition names —
// the database's no-self-reference check — so that objective is dropped from
// the target picker rather than offered and then rejected.
const targetOptions = computed(() => {
  if (scope === "quest" && conditionKind.value === "objective" && conditionObjectiveId.value) {
    return objectiveOptions.value.filter((option) => option.id !== conditionObjectiveId.value);
  }
  return objectiveOptions.value;
});

watch(targetOptions, (options) => {
  if (targetObjectiveId.value && !options.some((option) => option.id === targetObjectiveId.value)) targetObjectiveId.value = "";
});

const canAdd = computed(() => {
  if (scope === "quest" && conditionKind.value === "objective" && !conditionObjectiveId.value) return false;
  if (isLedgerAction(action.value)) return !!targetObjectiveId.value;
  if (action.value === "create_calendar_event") return !!calendarTitle.value.trim();
  return !!broadcastMessage.value.trim();
});

// ── Display ──────────────────────────────────────────────────────────────────

function conditionLabel(row: QuestConsequence): string {
  if (row.on_beat_id) return "on arrival";
  if (row.on_edge_id) {
    const edge = outgoing.value.find((candidate) => candidate.id === row.on_edge_id);
    return `on taking the route to "${edge ? beatTitle(edge.target_beat_id) : "a removed beat"}"`;
  }
  if (row.on_quest_settled) return "when the quest settles";
  return `when "${objectiveLabel(row.on_objective_id)}" becomes ${QUEST_OBJECTIVE_STATUS_LABELS[row.on_objective_status!].toLowerCase()}`;
}

function delaySuffix(row: QuestConsequence): string {
  return row.after_days > 0 ? ` (+${row.after_days}d)` : "";
}

function actionSummary(row: QuestConsequence): string {
  return describeQuestConsequenceAction(row, objectiveLabel);
}

// ── Mutations ────────────────────────────────────────────────────────────────

function resetForm() {
  conditionEdgeId.value = "";
  conditionKind.value = "settled";
  conditionObjectiveId.value = "";
  targetObjectiveId.value = "";
  afterDays.value = 0;
  calendarTitle.value = "";
  broadcastMessage.value = "";
}

async function add() {
  if (!canAdd.value) return;
  if (scope === "beat" && !beat) return;
  adding.value = true;
  error.value = "";
  try {
    const payload: QuestConsequenceActionPayload = action.value === "create_calendar_event"
      ? { title: calendarTitle.value.trim(), event_type: calendarType.value }
      : action.value === "send_broadcast"
        ? { message: broadcastMessage.value.trim() }
        : {};
    const insert: QuestConsequenceInsert = {
      quest_id: questId,
      on_beat_id: scope === "beat" && !conditionEdgeId.value ? beat!.id : null,
      on_edge_id: scope === "beat" && conditionEdgeId.value ? conditionEdgeId.value : null,
      on_objective_id: scope === "quest" && conditionKind.value === "objective" ? conditionObjectiveId.value : null,
      on_objective_status: scope === "quest" && conditionKind.value === "objective" ? conditionObjectiveStatus.value : null,
      on_quest_settled: scope === "quest" && conditionKind.value === "settled",
      after_days: afterDays.value || 0,
      action: action.value,
      target_objective_id: isLedgerAction(action.value) ? targetObjectiveId.value : null,
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
