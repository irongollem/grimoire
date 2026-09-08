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

    <!-- The one ledger, owned by the quest: every objective's live state, in
         one place. A beat only ever declares the rules that move an entry
         here — see the Payoff list on the beat page (`QuestPayoffPanel.vue`)
         — it never holds one of its own. -->
    <section class="rounded-lg border border-border bg-card overflow-hidden" aria-label="Objectives">
      <div class="px-3 py-2 border-b border-border bg-muted/20">
        <span class="text-label-lg font-semibold text-muted-foreground">
          Objectives
          <span v-if="objectives?.length" class="font-fell font-normal">
            ({{ doneCount }}/{{ objectives.length }})
          </span>
        </span>
      </div>
      <div class="p-2 flex flex-col gap-1">
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
          <span
            class="text-body flex-1 leading-snug transition-colors"
            :class="
              obj.status === 'complete'
                ? 'text-muted-foreground line-through'
                : obj.status === 'failed' ? 'text-muted-foreground' : 'text-foreground'
            "
          >
            {{ obj.description }}
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

    <QuestRulesPanel :quest-id="quest.id" />
    <QuestBackfillPanel :quest="quest" />
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
import AppInput from "@/components/common/AppInput.vue";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import { IconAdd, IconClose, IconHide, IconReveal } from "@/lib/icons";
import { useConfirm } from "@/composables/useConfirm";
import { useEntityNotes } from "@/composables/notes/useEntityNotes";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useNpcs } from "@/composables/npcs/useNpcs";
import {
  useAssertQuestObjectiveStatus,
  useCreateObjective,
  useDeleteObjective,
  useDeleteQuest,
  useQuestObjectives,
  useSubQuests,
  useUpdateObjective,
} from "@/composables/quests/useQuests";
import { useCreateScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import { countObjectivesComplete, nextObjectiveStatus, QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import { formatQuestForScriptorium } from "@/lib/scriptorium/scriptoriumImport";
import type { Quest, QuestObjective } from "@/types/quest.types";
import QuestObjectiveStatusMark from "./QuestObjectiveStatusMark.vue";
import QuestSidebarPanels from "./QuestSidebarPanels.vue";
import QuestRulesPanel from "./QuestRulesPanel.vue";
import QuestBackfillPanel from "./QuestBackfillPanel.vue";

const props = defineProps<{ quest: Quest }>();
const router = useRouter();
const { confirm } = useConfirm();
const questId = computed(() => props.quest.id);
const { data: objectives } = useQuestObjectives(questId);
const { data: subQuests } = useSubQuests(questId);
const { data: notes } = useEntityNotes("quest", questId);
const { data: npcs } = useNpcs();
const { data: locations } = useAllLocations();
const sharedNotes = computed(() => (notes.value ?? []).filter((note) => !note.is_private));
const { mutateAsync: createObjective } = useCreateObjective();
const { mutateAsync: assertObjectiveStatus } = useAssertQuestObjectiveStatus();
const { mutateAsync: updateObjective } = useUpdateObjective();
const { mutateAsync: deleteObjective } = useDeleteObjective();
const { mutateAsync: deleteQuest } = useDeleteQuest();
const { mutateAsync: createScriptoriumDocument } = useCreateScriptoriumDocument();
const deleting = ref(false);
const sendingToScriptorium = ref(false);
const newObjective = ref("");

const doneCount = computed(() => countObjectivesComplete(objectives.value ?? []));

function statusTooltip(objective: QuestObjective) {
  const label = QUEST_OBJECTIVE_STATUS_LABELS[objective.status];
  const next = QUEST_OBJECTIVE_STATUS_LABELS[nextObjectiveStatus(objective.status)];
  return `${label} — click for ${next.toLowerCase()}`;
}

function submitObjective() {
  if (!newObjective.value.trim()) return;
  void addObjective(newObjective.value.trim());
  newObjective.value = "";
}

async function addObjective(description: string) {
  await createObjective({ quest_id: props.quest.id, description, status: "pending", is_player_visible: false, sort_order: objectives.value?.length ?? 0 });
}

// Routed through the RPC, not a PATCH — see useAssertQuestObjectiveStatus.
// The consequence engine watches this exact write for `on_objective_status`
// conditions, which a raw column update would change without anyone noticing.
async function toggleObjective(objective: QuestObjective) {
  const status = nextObjectiveStatus(objective.status);
  await assertObjectiveStatus({ objectiveId: objective.id, questId: props.quest.id, status });
}

// A dormant objective is one the party has not been sent down the branch for
// yet; the database refuses dormant + visible together (23514), so the
// control is disabled rather than left to surface that error. Raising it
// first — by hand here, or via a beat's `raise` effect during play — is what
// makes Reveal available again.
function visibilityTooltip(objective: QuestObjective) {
  if (objective.status === "dormant") return "Dormant objectives are hidden until raised — raise it first";
  return objective.is_player_visible ? "Visible to players — click to hide" : "Hidden from players — click to reveal";
}

async function toggleObjectiveVisibility(objective: QuestObjective) {
  if (objective.status === "dormant") return;
  await updateObjective({ id: objective.id, questId: props.quest.id, update: { is_player_visible: !objective.is_player_visible } });
}

async function removeObjective(objective: QuestObjective) {
  await deleteObjective({ id: objective.id, questId: props.quest.id });
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
