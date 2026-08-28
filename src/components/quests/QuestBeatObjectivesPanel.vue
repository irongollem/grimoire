<template>
  <section class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Objectives decided here">
    <div>
      <h3 class="font-cinzel text-sm font-bold text-foreground">Objectives decided here</h3>
      <p class="text-caption text-muted-foreground">
        Running the session applies these. Attach one to the beat and it fires on arrival; attach it to a branch and it fires only if the party takes that road.
      </p>
    </div>

    <ul v-if="effects.length" class="space-y-1.5">
      <li v-for="effect in effects" :key="effect.id" class="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border p-2 text-caption">
        <span class="rounded bg-muted px-1.5 py-0.5 uppercase text-muted-foreground" :class="EFFECT_TONES[effect.effect]">{{ EFFECT_LABELS[effect.effect] }}</span>
        <span class="min-w-0 flex-1 truncate text-foreground">{{ objectiveLabel(effect.objective_id) }}</span>
        <span class="truncate text-muted-foreground">{{ triggerLabel(effect) }}</span>
        <AppButton label="Remove" size="xs" variant="subtle" :loading="removingId === effect.id" @click="remove(effect.id)" />
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">
      Nothing here changes an objective yet.
    </p>

    <div v-if="objectiveOptions.length" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]">
      <EntityCombobox v-model="objectiveId" class="min-w-0 sm:col-span-2" :options="objectiveOptions" placeholder="Which objective…" />
      <AppSelect v-model="trigger" class="min-w-0" aria-label="When this fires">
        <option value="beat">On arriving at this beat</option>
        <option v-for="edge in outgoing" :key="edge.id" :value="edge.id">On taking: {{ edge.label || "Continue" }}</option>
      </AppSelect>
      <AppSelect v-model="effect" class="min-w-0" aria-label="What it does">
        <option v-for="option in QUEST_OBJECTIVE_EFFECTS" :key="option" :value="option">{{ EFFECT_LABELS[option] }}</option>
      </AppSelect>
      <div class="sm:col-span-2 flex justify-end">
        <AppButton label="Add" size="sm" :disabled="!objectiveId" :loading="adding" @click="add" />
      </div>
    </div>
    <p v-else class="text-caption italic text-muted-foreground">
      Add an objective on the quest overview first, then it can be decided from here.
    </p>

    <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useCreateQuestObjectiveEffect, useDeleteQuestObjectiveEffect, useQuestObjectiveEffects } from "@/composables/quests/useQuestFlow";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import type { QuestBeat, QuestBeatEdge, QuestObjectiveEffect } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const QUEST_OBJECTIVE_EFFECTS = ["reveal", "complete", "fail"] as const;

// Phrased as what happens at the table, not as a state transition: "Complete"
// rather than "set status = complete", because the DM is describing a story
// consequence and will read this list back mid-session.
const EFFECT_LABELS: Record<QuestObjectiveEffect["effect"], string> = {
  reveal: "Reveal to players",
  complete: "Complete",
  fail: "Fail",
};

const EFFECT_TONES: Record<QuestObjectiveEffect["effect"], string> = {
  reveal: "text-primary",
  complete: "text-tone-success",
  fail: "text-destructive",
};

const props = defineProps<{ beat: QuestBeat; edges: QuestBeatEdge[] }>();

const questId = computed(() => props.beat.quest_id);
const { data: objectives } = useQuestObjectives(questId);
const effectsQuery = useQuestObjectiveEffects(questId);
const createEffect = useCreateQuestObjectiveEffect();
const deleteEffect = useDeleteQuestObjectiveEffect();

const outgoing = computed(() => props.edges.filter((edge) => edge.source_beat_id === props.beat.id));
const outgoingIds = computed(() => new Set(outgoing.value.map((edge) => edge.id)));
// A branch belongs to the beat it leaves, so this panel owns both the beat's own
// arrival rules and the rules on every road out of it.
const effects = computed(() => (effectsQuery.data.value ?? []).filter((effect) =>
  effect.trigger_beat_id === props.beat.id
  || (effect.trigger_edge_id !== null && outgoingIds.value.has(effect.trigger_edge_id))));
const objectiveOptions = computed(() => (objectives.value ?? []).map((objective) => ({ id: objective.id, name: objective.description })));

const objectiveId = ref("");
const trigger = ref("beat");
const effect = ref<QuestObjectiveEffect["effect"]>("complete");
const adding = ref(false);
const removingId = ref("");
const error = ref("");

function objectiveLabel(id: string) {
  return (objectives.value ?? []).find((objective) => objective.id === id)?.description ?? "Objective removed";
}

function triggerLabel(row: QuestObjectiveEffect) {
  if (row.trigger_beat_id) return "on arrival";
  const edge = outgoing.value.find((candidate) => candidate.id === row.trigger_edge_id);
  return `on taking "${edge?.label || "Continue"}"`;
}

async function add() {
  if (!objectiveId.value) return;
  adding.value = true;
  error.value = "";
  try {
    await createEffect.mutateAsync({
      quest_id: props.beat.quest_id,
      objective_id: objectiveId.value,
      trigger_beat_id: trigger.value === "beat" ? props.beat.id : null,
      trigger_edge_id: trigger.value === "beat" ? null : trigger.value,
      effect: effect.value,
    });
    objectiveId.value = "";
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "Could not attach this objective";
  } finally { adding.value = false; }
}

async function remove(id: string) {
  removingId.value = id;
  error.value = "";
  try { await deleteEffect.mutateAsync({ id, questId: props.beat.quest_id }); }
  catch (caught) { error.value = caught instanceof Error ? caught.message : "Could not remove this rule"; }
  finally { removingId.value = ""; }
}
</script>
