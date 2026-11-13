<template>
  <section class="rounded-lg border border-border bg-card overflow-hidden" aria-label="Objectives">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <h3 class="text-label-lg font-semibold text-muted-foreground">
        Objectives
        <span v-if="objectives?.length" class="font-fell font-normal">
          ({{ doneCount }}/{{ objectives.length }})
        </span>
      </h3>
    </div>
    <div class="p-2 flex flex-col gap-1">
      <QuestSettledPrompt :quest-id="questId" compact />
      <div
        v-for="obj in objectives ?? []"
        :key="obj.id"
        class="flex items-start gap-2 group rounded px-2 py-1.5 hover:bg-muted/40 transition-colors"
      >
        <AppButton
          variant="ghost"
          size="inline-xs"
          class="mt-0.5 shrink-0"
          :tooltip="statusTooltip(obj)"
          :aria-label="statusTooltip(obj)"
          @click="toggleObjective(obj)"
        >
          <template #icon>
            <QuestObjectiveStatusMark :status="obj.status" />
          </template>
        </AppButton>
        <span class="min-w-0 flex-1">
          <span
            class="block text-body leading-snug transition-colors"
            :class="
              obj.status === 'complete'
                ? 'text-muted-foreground line-through'
                : obj.status === 'failed' ? 'text-muted-foreground' : 'text-foreground'
            "
          >
            {{ obj.description }}
          </span>
          <QuestObjectiveDueDate :due="objectiveDueDate(obj)" @change="setDueDate(obj, $event)" />
        </span>
        <AppButton
          variant="ghost"
          size="inline-xs"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          :class="obj.is_player_visible ? 'text-elven-green' : ''"
          :icon="obj.is_player_visible ? IconReveal : IconHide"
          :disabled="obj.status === 'dormant'"
          :tooltip="visibilityTooltip(obj)"
          @click="toggleObjectiveVisibility(obj)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="inline-xs"
          class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          :icon="IconClose"
          aria-label="Remove objective"
          @click="removeObjective(obj)"
        />
      </div>
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
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconClose, IconHide, IconReveal } from "@/lib/icons";
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
import QuestObjectiveStatusMark from "../inspector/QuestObjectiveStatusMark.vue";
import QuestObjectiveDueDate from "../inspector/QuestObjectiveDueDate.vue";
import QuestSettledPrompt from "../run/QuestSettledPrompt.vue";

const props = defineProps<{ questId: string }>();
const questId = computed(() => props.questId);
const { data: objectives } = useQuestObjectives(questId);
const { mutateAsync: createObjective } = useCreateObjective();
const { mutateAsync: assertObjectiveStatus } = useAssertQuestObjectiveStatus();
const { mutateAsync: updateObjective } = useUpdateObjective();
const { mutateAsync: deleteObjective } = useDeleteObjective();
const toast = useToast();
const newObjective = ref("");

const doneCount = computed(() => countObjectivesComplete(objectives.value ?? []));

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
  await createObjective({ quest_id: props.questId, description, status: "pending", is_player_visible: false, sort_order: objectives.value?.length ?? 0, due_year: null, due_month: null, due_day: null });
}

// Routed through the RPC, not a PATCH — see useAssertQuestObjectiveStatus.
// The consequence engine watches this exact write for `on_objective_status`
// conditions, which a raw column update would change without anyone noticing.
async function toggleObjective(objective: QuestObjective) {
  const status = nextObjectiveStatus(objective.status);
  await assertObjectiveStatus({ objectiveId: objective.id, questId: props.questId, status });
}

// A dormant objective is one the party has not been sent down the branch for
// yet; the database refuses dormant + visible together (23514), so the
// control is disabled rather than left to surface that error. Raising it
// first — by hand here, or via a beat's `raise` effect during play — is what
// makes Reveal available again.
function visibilityTooltip(objective: QuestObjective) {
  if (objective.status === "dormant") return "Dormant objectives are hidden until raised. Raise it first";
  return objective.is_player_visible ? "Visible to players: click to hide" : "Hidden from players: click to reveal";
}

async function toggleObjectiveVisibility(objective: QuestObjective) {
  if (objective.status === "dormant") return;
  await updateObjective({ id: objective.id, questId: props.questId, update: { is_player_visible: !objective.is_player_visible } });
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
