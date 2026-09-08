<template>
  <section class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Objectives ledger">
    <div class="flex items-center justify-between gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Objectives</h3>
      <span v-if="objectives.length" class="text-caption text-muted-foreground">{{ doneCount }}/{{ objectives.length }}</span>
    </div>
    <ul v-if="objectives.length" class="flex flex-col gap-1">
      <li v-for="objective in objectives" :key="objective.id" class="flex items-start gap-2">
        <AppButton
          variant="ghost"
          size="inline-xs"
          class="mt-0.5 shrink-0"
          :tooltip="statusTooltip(objective)"
          :aria-label="statusTooltip(objective)"
          @click="toggle(objective)"
        >
          <template #icon><QuestObjectiveStatusMark :status="objective.status" /></template>
        </AppButton>
        <span class="flex-1">
          <span
            class="block text-caption leading-snug"
            :class="objective.status === 'complete' ? 'text-muted-foreground line-through' : objective.status === 'failed' ? 'text-muted-foreground' : 'text-foreground'"
          >{{ objective.description }}</span>
          <span class="block text-caption text-muted-foreground">{{ captionFor(objective) }}</span>
        </span>
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">No objectives raised yet.</p>
  </section>
</template>

<script setup lang="ts">
/**
 * The objectives ledger, alongside the run cockpit's three concerns (#820,
 * epic #780) — the tally at a glance, and a one-click cycle through the same
 * four-state mark the overview checklist uses. It calls the same sole writer
 * (`assert_quest_objective_status`) rather than opening a second one: the
 * ledger has one home either way, and this is a second reader of it, not a
 * second editor. Prep-time actions — adding an objective, hiding it from
 * players — stay on the overview's lifecycle panel; mid-session the DM only
 * ever needs to say a status just changed.
 *
 * Each row's caption names its status plus, when it applies, what taking a
 * gated route unlocks ("gates <target>") and which sibling thread's beat
 * raised it ("· Thread B") — the ledger's own hints for reading several
 * threads' worth of state in one panel (#853, story F).
 */
import { computed } from "vue";
import { useAssertQuestObjectiveStatus, useQuestObjectives } from "@/composables/quests/useQuests";
import { useQuestConsequences } from "@/composables/quests/useQuestFlow";
import { countObjectivesComplete, nextObjectiveStatus, QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import { objectiveGateTargets, objectiveThreadHint } from "@/lib/quests/run";
import type { QuestObjective, QuestRuntimeChoice, QuestThreadCursor } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import QuestObjectiveStatusMark from "./QuestObjectiveStatusMark.vue";

const { questId, threadId, outgoing, threads } = defineProps<{
  questId: string;
  threadId: string;
  outgoing: QuestRuntimeChoice[];
  threads: QuestThreadCursor[];
}>();
const { data } = useQuestObjectives(computed(() => questId));
const objectives = computed(() => data.value ?? []);
const doneCount = computed(() => countObjectivesComplete(objectives.value));
const { mutateAsync: assertStatus } = useAssertQuestObjectiveStatus();
const consequencesQuery = useQuestConsequences(computed(() => questId));

function statusTooltip(objective: QuestObjective): string {
  const label = QUEST_OBJECTIVE_STATUS_LABELS[objective.status];
  const next = QUEST_OBJECTIVE_STATUS_LABELS[nextObjectiveStatus(objective.status)];
  return `${label} — click for ${next.toLowerCase()}`;
}

function captionFor(objective: QuestObjective): string {
  const parts = [objective.status as string];
  const gates = objectiveGateTargets(objective.id, outgoing);
  if (gates.length) parts.push(`gates ${gates.join(", ")}`);
  const hint = objectiveThreadHint(objective.id, consequencesQuery.data.value ?? [], threads, threadId);
  if (hint) parts.push(`Thread ${hint}`);
  return parts.join(" · ");
}

async function toggle(objective: QuestObjective) {
  await assertStatus({ objectiveId: objective.id, questId, status: nextObjectiveStatus(objective.status) });
}
</script>
