<template>
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
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { describeQuestRouteGate, GATE_MAX_STATUSES, type GateConditionDraft } from "@/lib/quests/gates";
import { QUEST_OBJECTIVE_STATUS_LABELS, QUEST_OBJECTIVE_STATUSES } from "@/lib/quests/objectives";
import type { QuestGateMode, QuestObjectiveStatus, QuestRouteGate } from "@/types/quest.types";

/** A route's gate: the objectives that must stand at given statuses for it to open. Shared by the route column and the legacy route panel. */
const { objectiveOptions, gatePreview = null } = defineProps<{
  objectiveOptions: { id: string; name: string }[];
  /** The gate the unsaved conditions would make, for the plain-language line. */
  gatePreview?: QuestRouteGate | null;
}>();

const gateModeOptions: SegmentedOption<QuestGateMode>[] = [
  { value: "all", label: "All of these" },
  { value: "any", label: "Any of these" },
];

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
