<template>
  <section class="rounded-lg border border-border bg-card p-3" aria-label="Selected route">
    <header class="flex items-center gap-2">
      <h3 class="text-heading-sm font-bold text-foreground">Selected route</h3>
      <span class="ml-auto truncate rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground">{{ sourceTitle }} → {{ targetTitle }}</span>
    </header>

    <div class="mt-2 space-y-2">
      <div class="flex items-center justify-between gap-2">
        <span class="text-caption font-semibold text-foreground">Route kind</span>
        <SegmentedControl v-model="routeKind" size="sm" :options="routeKindOptions" />
      </div>
      <p v-if="routeKind === 'choice' && !canBeParallel" class="text-caption text-muted-foreground">This beat has no other choice route yet. Add one before opening a parallel route here, or its thread would have nowhere to send the cursor.</p>

      <AppInput v-if="routeKind === 'parallel'" v-model="threadLabel" placeholder="Thread label: shown to the DM and on the player thread…" aria-label="Opens thread" />

      <div class="space-y-2" role="group" aria-label="Route gate">
        <div class="flex items-center justify-between gap-2">
          <span class="text-caption font-semibold text-foreground">Gate</span>
          <SegmentedControl v-if="conditions.length > 1" v-model="gateMode" size="sm" :options="gateModeOptions" />
        </div>
        <p v-if="!conditions.length" class="text-caption text-muted-foreground">No conditions: this route is always open.</p>
        <div v-for="(condition, index) in conditions" :key="condition.key" class="space-y-1.5 rounded-md border border-border bg-muted/40 p-2">
          <div class="flex items-center gap-2">
            <EntityCombobox
              :model-value="condition.objectiveId"
              :options="objectiveChoicesFor(condition)"
              placeholder="Which objective…"
              @update:model-value="setObjective(index, $event)"
            />
            <AppButton label="Remove" size="xs" variant="subtle" @click="removeCondition(index)" />
          </div>
          <div class="flex flex-wrap gap-x-3 gap-y-1" role="group" aria-label="Statuses that open the route">
            <AppCheckbox
              v-for="status in QUEST_OBJECTIVE_STATUSES"
              :key="status"
              :model-value="condition.statuses"
              :value="status"
              :label="QUEST_OBJECTIVE_STATUS_LABELS[status]"
              :disabled="!condition.statuses.includes(status) && condition.statuses.length >= GATE_MAX_STATUSES"
              label-role="caption"
              size="sm"
              @update:model-value="setStatuses(index, $event)"
            />
          </div>
        </div>
        <AppButton label="Add condition" size="xs" variant="subtle" :disabled="!canAddCondition" @click="addCondition" />
        <p v-if="gatePreview" class="text-caption text-muted-foreground">{{ describeQuestRouteGate(gatePreview) }}</p>
      </div>

      <div v-if="effects.length" class="rounded-md border border-border bg-muted/40 p-2">
        <div class="flex items-center gap-2">
          <p class="text-caption font-semibold text-foreground">Consequences on this route</p>
          <AppButton :to="editTo" label="Edit" size="xs" variant="subtle" class="ml-auto" />
        </div>
        <ul class="mt-1 space-y-0.5 text-caption text-muted-foreground">
          <li v-for="(effect, index) in effects" :key="index">{{ describeQuestRouteEffect(effect) }}</li>
        </ul>
      </div>
    </div>

    <p v-if="error" role="alert" class="mt-2 text-caption text-destructive">{{ error }}</p>
    <div class="mt-3 flex justify-end gap-2">
      <AppButton label="Save route" size="sm" :loading="saving" @click="emit('save')" />
      <AppButton label="Delete route" size="sm" variant="destructive" @click="emit('delete')" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { describeQuestRouteEffect, describeQuestRouteGate, GATE_MAX_STATUSES, type GateConditionDraft } from "@/lib/quests/gates";
import { QUEST_OBJECTIVE_STATUS_LABELS, QUEST_OBJECTIVE_STATUSES } from "@/lib/quests/objectives";
import type { QuestGateMode, QuestObjectiveStatus, QuestRouteEffect, QuestRouteGate, QuestRouteKind } from "@/types/quest.types";

const { sourceTitle, targetTitle, objectiveOptions, effects, editTo, canBeParallel, gatePreview = null, saving = false, error = "" } = defineProps<{
  sourceTitle: string;
  targetTitle: string;
  objectiveOptions: { id: string; name: string }[];
  effects: QuestRouteEffect[];
  editTo: string;
  canBeParallel: boolean;
  /** The gate the unsaved conditions would make, for the plain-language line. */
  gatePreview?: QuestRouteGate | null;
  saving?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ save: []; delete: [] }>();

// A beat with no choice route yet cannot afford to spend its only outgoing
// route on a parallel one - the invariant the composer also enforces when
// creating a route from scratch (frame `01 Delta`'s "invariant to keep").
const routeKindOptions = computed<SegmentedOption<QuestRouteKind>[]>(() => [
  { value: "choice", label: "Choice" },
  { value: "parallel", label: "Parallel", disabled: !canBeParallel, tooltip: canBeParallel ? undefined : "Add a choice route from this beat first." },
]);
const gateModeOptions: SegmentedOption<QuestGateMode>[] = [
  { value: "all", label: "All of these" },
  { value: "any", label: "Any of these" },
];

const routeKind = defineModel<QuestRouteKind>("routeKind", { required: true });
const threadLabel = defineModel<string>("threadLabel", { required: true });
const gateMode = defineModel<QuestGateMode>("gateMode", { required: true });
const conditions = defineModel<GateConditionDraft[]>("conditions", { required: true });

// An objective may be a condition at most once per route, so each row's picker
// offers its own objective plus the ones no other row has taken.
function objectiveChoicesFor(condition: GateConditionDraft) {
  const taken = new Set(conditions.value.filter((other) => other.key !== condition.key).map((other) => other.objectiveId));
  return objectiveOptions.filter((option) => !taken.has(option.id));
}
const canAddCondition = computed(() => conditions.value.length < objectiveOptions.length);

let nextKey = 0;
function addCondition() {
  conditions.value = [...conditions.value, { key: `new-${nextKey++}`, gateId: null, objectiveId: "", statuses: ["complete"] }];
}
function removeCondition(index: number) {
  conditions.value = conditions.value.filter((_, at) => at !== index);
}
function setObjective(index: number, objectiveId: string) {
  conditions.value = conditions.value.map((condition, at) => (at === index ? { ...condition, objectiveId } : condition));
}
function setStatuses(index: number, statuses: QuestObjectiveStatus[]) {
  conditions.value = conditions.value.map((condition, at) => (at === index ? { ...condition, statuses } : condition));
}
</script>
