<template>
  <!-- The quest column's foot (#1194, frame 11): every objective, with the beat
       that raises it, kept in view under the notes. Many rows scroll on their own. -->
  <section class="flex min-w-0 flex-col gap-1.5" aria-label="Objectives">
    <h3 class="text-heading-sm font-bold text-foreground">
      Objectives
      <span v-if="objectives?.length" class="font-fell font-normal text-muted-foreground">({{ doneCount }}/{{ objectives.length }})</span>
    </h3>
    <QuestSettledPrompt :quest-id="questId" compact />
    <ul class="flex max-h-[40vh] min-h-0 flex-col gap-0.5 overflow-y-auto">
      <li
        v-for="row in rows"
        :key="row.objective.id"
        class="group flex items-start gap-2 rounded px-1 py-1 transition-colors hover:bg-muted/40"
      >
        <AppButton
          variant="ghost"
          size="inline-xs"
          class="mt-0.5 shrink-0"
          :tooltip="statusTooltip(row.objective)"
          :aria-label="statusTooltip(row.objective)"
          @click="toggleObjective(row.objective)"
        >
          <template #icon>
            <QuestObjectiveStatusMark :status="row.objective.status" />
          </template>
        </AppButton>
        <span class="min-w-0 flex-1">
          <span class="block text-body leading-snug" :class="descriptionClass(row.objective.status)">{{ row.objective.description }}</span>
          <span v-if="row.dormantLine" class="block text-caption italic text-muted-foreground">
            {{ row.dormantLine }}
            <AppButton v-if="row.source" variant="link" size="inline-caption" :label="row.source.title" @click="emit('select-beat', row.source.id)" />
          </span>
          <span v-else-if="row.source" class="block text-caption text-muted-foreground">
            Raised at
            <AppButton variant="link" size="inline-caption" :label="row.source.title" @click="emit('select-beat', row.source.id)" />
          </span>
          <QuestObjectiveDueDate :due="objectiveDueDate(row.objective)" @change="setDueDate(row.objective, $event)" />
        </span>
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          class="shrink-0 transition-opacity [@media(hover:hover)]:opacity-0 group-hover:opacity-100"
          :icon="IconClose"
          aria-label="Remove objective"
          @click="removeObjective(row.objective)"
        />
      </li>
    </ul>
    <div class="flex items-center gap-2 pt-1">
      <AppInput
        v-model="newObjective"
        tone="underline"
        size="body"
        class="flex-1"
        placeholder="Add objective…"
        @keydown.enter.prevent="submitObjective"
      />
      <AppButton
        variant="ghost"
        tone="primary"
        size="inline"
        :disabled="!newObjective.trim()"
        aria-label="Add objective"
        :icon="IconAdd"
        icon-size="md"
        @click="submitObjective"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useQuestBeats, useQuestConsequences } from "@/composables/quests/useQuestFlow";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconClose } from "@/lib/icons";
import {
  useAssertQuestObjectiveStatus,
  useCreateObjective,
  useDeleteObjective,
  useQuestObjectives,
  useUpdateObjective,
} from "@/composables/quests/useQuests";
import { countObjectivesComplete, nextObjectiveStatus, QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import { objectiveDueDate } from "@/lib/quests/deadlines";
import type { CalendarDate } from "@/lib/calendar/dayMath";
import type { QuestObjective } from "@/types/quest.types";
import { objectiveSources } from "@/lib/quests/objectiveSources";
import QuestObjectiveStatusMark from "../inspector/QuestObjectiveStatusMark.vue";
import QuestObjectiveDueDate from "../inspector/QuestObjectiveDueDate.vue";
import QuestSettledPrompt from "../run/QuestSettledPrompt.vue";

const props = defineProps<{ questId: string }>();
const emit = defineEmits<{ "select-beat": [beatId: string] }>();
const questId = computed(() => props.questId);
const { data: objectives } = useQuestObjectives(questId);
const { data: beats } = useQuestBeats(questId);
const { data: consequences } = useQuestConsequences(questId);
const { mutateAsync: createObjective } = useCreateObjective();
const { mutateAsync: assertObjectiveStatus } = useAssertQuestObjectiveStatus();
const { mutateAsync: updateObjective } = useUpdateObjective();
const { mutateAsync: deleteObjective } = useDeleteObjective();
const toast = useToast();
const newObjective = ref("");

const doneCount = computed(() => countObjectivesComplete(objectives.value ?? []));

// Each objective with the beat whose raise rule brings it in (if any).
const rows = computed(() => {
  const sources = objectiveSources(consequences.value ?? [], beats.value ?? []);
  return (objectives.value ?? []).map((objective) => {
    const source = sources.get(objective.id) ?? null;
    const dormantLine = objective.status !== "dormant" ? null : source ? "Not raised yet: comes with" : "Not raised yet";
    return { objective, source, dormantLine };
  });
});

function descriptionClass(status: QuestObjective["status"]) {
  if (status === "complete") return "text-muted-foreground line-through";
  if (status === "failed") return "text-muted-foreground";
  if (status === "dormant") return "italic text-muted-foreground";
  return "text-foreground";
}

function statusTooltip(objective: QuestObjective) {
  const label = QUEST_OBJECTIVE_STATUS_LABELS[objective.status];
  const next = QUEST_OBJECTIVE_STATUS_LABELS[nextObjectiveStatus(objective.status)];
  return `${label}: click for ${next.toLowerCase()}`;
}

function submitObjective() {
  if (!newObjective.value.trim()) return;
  void addObjective(newObjective.value.trim());
  newObjective.value = "";
}

async function addObjective(description: string) {
  await createObjective({ quest_id: props.questId, description, status: "pending", sort_order: objectives.value?.length ?? 0, due_year: null, due_month: null, due_day: null });
}

// Routed through the RPC, not a PATCH — see useAssertQuestObjectiveStatus.
// The consequence engine watches this exact write for `on_objective_status`
// conditions, which a raw column update would change without anyone noticing.
async function toggleObjective(objective: QuestObjective) {
  const status = nextObjectiveStatus(objective.status);
  await assertObjectiveStatus({ objectiveId: objective.id, questId: props.questId, status });
}

async function setDueDate(objective: QuestObjective, date: CalendarDate | null) {
  try {
    await updateObjective({
      id: objective.id,
      questId: props.questId,
      update: { due_year: date ? date.year : null, due_month: date ? date.month : null, due_day: date ? date.day : null },
    });
  } catch (e: unknown) {
    toast.error(toast.fromError(e));
  }
}

async function removeObjective(objective: QuestObjective) {
  await deleteObjective({ id: objective.id, questId: props.questId });
}
</script>
