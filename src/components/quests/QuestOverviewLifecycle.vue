<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Quest lifecycle">
    <div>
      <div class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="font-cinzel text-sm font-bold text-foreground">Quest lifecycle</h3>
          <p class="text-caption text-muted-foreground">Objectives and consequences that span multiple beats.</p>
        </div>
        <AppButton
          label="Send to Scriptorium"
          variant="subtle"
          size="sm"
          :loading="sendingToScriptorium"
          @click="sendToScriptorium"
        />
      </div>
    </div>
    <QuestObjectivesList
      :objectives="objectives"
      :is-new="false"
      @toggle="toggleObjective"
      @toggle-visibility="toggleObjectiveVisibility"
      @remove="removeObjective"
      @add="addObjective"
    />
    <QuestTriggersPanel
      :is-new="false"
      :quest-id="quest.id"
      :triggers="triggers"
      :objectives="objectives"
      @remove="removeTrigger"
    />
    <QuestSidebarPanels
      :is-new="false"
      :quest-id="quest.id"
      :sub-quests="subQuests"
      :shared-notes="sharedNotes"
    />
    <EntityCalendarSection entity-type="quest" :entity-id="quest.id" :entity-name="quest.title || 'Untitled Quest'" />
    <div class="flex items-center justify-between gap-3 border-t border-border pt-3">
      <p class="text-caption text-muted-foreground">Deleting a quest also removes its story flow.</p>
      <AppButton label="Delete quest" variant="destructive" :disabled="deleting" @click="removeQuest" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useEntityNotes } from "@/composables/useEntityNotes";
import { useAllLocations } from "@/composables/useLocations";
import { useNpcs } from "@/composables/useNpcs";
import {
  scheduleQuestTriggers,
  useCreateObjective,
  useDeleteObjective,
  useDeleteQuest,
  useDeleteQuestTrigger,
  useQuestObjectives,
  useQuestTriggers,
  useSubQuests,
  useUpdateObjective,
} from "@/composables/useQuests";
import { useCreateScriptoriumDocument } from "@/composables/useScriptorium";
import { nextObjectiveStatus } from "@/lib/quests/objectives";
import { formatQuestForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import { useCampaignStore } from "@/stores/campaign";
import type { Quest, QuestObjective } from "@/types/quest.types";
import QuestObjectivesList from "./QuestObjectivesList.vue";
import QuestSidebarPanels from "./QuestSidebarPanels.vue";
import QuestTriggersPanel from "./QuestTriggersPanel.vue";

const props = defineProps<{ quest: Quest }>();
const router = useRouter();
const campaign = useCampaignStore();
const { confirm } = useConfirm();
const questId = computed(() => props.quest.id);
const { data: objectives } = useQuestObjectives(questId);
const { data: triggers } = useQuestTriggers(questId);
const { data: subQuests } = useSubQuests(questId);
const { data: notes } = useEntityNotes("quest", questId);
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
const sharedNotes = computed(() => (notes.value ?? []).filter((note) => !note.is_private));
const { mutateAsync: createObjective } = useCreateObjective();
const { mutateAsync: updateObjective } = useUpdateObjective();
const { mutateAsync: deleteObjective } = useDeleteObjective();
const { mutateAsync: deleteTrigger } = useDeleteQuestTrigger();
const { mutateAsync: deleteQuest } = useDeleteQuest();
const { mutateAsync: createScriptoriumDocument } = useCreateScriptoriumDocument();
const deleting = ref(false);
const sendingToScriptorium = ref(false);

async function addObjective(description: string) {
  await createObjective({ quest_id: props.quest.id, description, status: "pending", is_player_visible: false, sort_order: objectives.value?.length ?? 0 });
}

async function toggleObjective(objective: QuestObjective) {
  const status = nextObjectiveStatus(objective.status);
  await updateObjective({ id: objective.id, questId: props.quest.id, update: { status } });
  // Only completion schedules downstream triggers — a failed objective has not
  // been achieved, and firing its calendar event or broadcast would announce
  // something that did not happen.
  if (status === "complete" && campaign.activeCampaignId) {
    void scheduleQuestTriggers(props.quest.id, "objective_done", objective.id, {
      year: campaign.todayYear,
      month: campaign.todayMonth,
      day: campaign.todayDay,
    }, campaign.activeCampaignId);
  }
}

async function toggleObjectiveVisibility(objective: QuestObjective) {
  await updateObjective({ id: objective.id, questId: props.quest.id, update: { is_player_visible: !objective.is_player_visible } });
}

async function removeObjective(objective: QuestObjective) {
  await deleteObjective({ id: objective.id, questId: props.quest.id });
}

async function removeTrigger(trigger: { id: string }) {
  await deleteTrigger({ id: trigger.id, questId: props.quest.id });
}

async function removeQuest() {
  if (deleting.value || !(await confirm(`Delete "${props.quest.title || "this quest"}"?`))) return;
  deleting.value = true;
  try {
    await deleteQuest(props.quest.id);
    await router.push("/quests");
  } finally {
    deleting.value = false;
  }
}

async function sendToScriptorium() {
  sendingToScriptorium.value = true;
  try {
    const giverName = (npcs.value ?? []).find((npc) => npc.id === props.quest.giver_npc_id)?.name ?? null;
    const locationName = (locations.value ?? []).find((location) => location.id === props.quest.location_id)?.name ?? null;
    const document = await createScriptoriumDocument(formatQuestForScriptorium(
      props.quest,
      objectives.value ?? [],
      giverName,
      locationName,
    ));
    await router.push(`/scriptorium/${document.id}`);
  } finally {
    sendingToScriptorium.value = false;
  }
}
</script>
