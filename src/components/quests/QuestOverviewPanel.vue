<template>
  <!--
    This was a right-hand drawer behind `?overview=true`, with no affordance
    anywhere pointing at it. That framing said "aside" about the one surface
    that holds the quest's premise, its metadata and its lifecycle. It is now
    a peer surface of the story flow.

    The opening beat used to live here too, as a stored `is_overview` row with
    its own editor. That bridge object is gone (#793): the opening beat is now
    an ordinary beat — a graph root, computed rather than minted — and a beat
    is edited in exactly one place, the story-flow inspector. This panel only
    gets the quest to its first beat and then points at where to prepare it.
  -->
  <section class="space-y-3" aria-label="Quest overview">
    <QuestOverviewMetadata :quest="quest" />

    <QuestConsistencyPanel v-if="consistencyReady" :findings="consistencyFindings" />

    <LoadingSpinner v-if="beatsQuery.isLoading.value || edgesQuery.isLoading.value" class="mx-auto my-12" />

    <section v-else-if="!beats.length" class="space-y-3 rounded-lg border border-dashed border-border bg-card p-4 text-center" aria-label="No opening beat yet">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Write the opening beat</h3>
      <p class="text-caption text-muted-foreground">A quest starts once it has a first beat — the scene where the party actually picks it up.</p>
      <AppButton label="Write the opening beat" variant="primary" :loading="creating" @click="createOpeningBeat" />
      <p v-if="createError" role="alert" class="text-caption text-destructive">{{ createError }}</p>
    </section>

    <section v-else class="space-y-2 rounded-lg border border-border bg-card p-3" aria-label="Opening beats">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Opens at</h3>
      <p v-if="!roots.length && !entryBeat" role="alert" class="text-caption text-tone-caution">
        Every beat here has an incoming route, so there is no way in for the party. Open Story flow and break the loop.
      </p>
      <ul v-else class="space-y-1">
        <li v-if="entryBeat" class="flex items-center gap-1.5">
          <span class="rounded bg-tone-info/15 px-1.5 py-0.5 text-caption text-ink-info">{{ isEntryRoot ? "entry" : "entry · not a root" }}</span>
          <AppButton :to="workLinkFor(entryBeat.id)" :label="entryBeat.title || 'Untitled beat'" variant="link" size="sm" />
        </li>
        <li v-for="beat in otherRoots" :key="beat.id">
          <AppButton :to="workLinkFor(beat.id)" :label="beat.title || 'Untitled beat'" variant="link" size="sm" />
        </li>
      </ul>
    </section>

    <QuestOverviewLifecycle :quest="quest" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useCreateQuestBeatWithRoute,
  useQuestBeatEdgeGates,
  useQuestBeatEdges,
  useQuestBeats,
  useQuestConsequences,
} from "@/composables/quests/useQuestFlow";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { rootBeatIds } from "@/lib/quests/graph";
import { deriveQuestConsistency } from "@/lib/quests/consistency";
import type { Quest } from "@/types/quest.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import AppButton from "@/components/common/AppButton.vue";
import QuestConsistencyPanel from "./QuestConsistencyPanel.vue";
import QuestOverviewLifecycle from "./QuestOverviewLifecycle.vue";
import QuestOverviewMetadata from "./QuestOverviewMetadata.vue";

const props = defineProps<{ quest: Quest }>();
const questId = computed(() => props.quest.id);
const route = useRoute();
const router = useRouter();
const beatsQuery = useQuestBeats(questId);
const edgesQuery = useQuestBeatEdges(questId);
// Objectives are already loaded by QuestOverviewLifecycle on this same
// surface — same composable, same query key, so this shares its cache rather
// than firing a second request. Consequences and gates are not loaded
// anywhere on Overview today; the consistency check is the first reason to.
const objectivesQuery = useQuestObjectives(questId);
const consequencesQuery = useQuestConsequences(questId);
const gatesQuery = useQuestBeatEdgeGates(questId);
const createBeatWithRoute = useCreateQuestBeatWithRoute();
const creating = ref(false);
const createError = ref("");

const beats = computed(() => beatsQuery.data.value ?? []);
const edges = computed(() => edgesQuery.data.value ?? []);
const rootIds = computed(() => new Set(rootBeatIds(beats.value, edges.value)));
const roots = computed(() => beats.value.filter((beat) => rootIds.value.has(beat.id)));
// The formal entry (`quests.entry_beat_id`) always leads the list, even when
// the DM chose a beat with an incoming route — it is still where the story
// begins, just not where the graph computes an unforced way in.
const entryBeat = computed(() => beats.value.find((beat) => beat.id === props.quest.entry_beat_id) ?? null);
const isEntryRoot = computed(() => Boolean(entryBeat.value && rootIds.value.has(entryBeat.value.id)));
const otherRoots = computed(() => roots.value.filter((beat) => beat.id !== entryBeat.value?.id));

// Held back until every input has loaded at least once, so the panel never
// flashes a finding derived from a partially-loaded quest (e.g. "objective
// never raised" before its raising consequence has arrived).
const consistencyReady = computed(() => (
  !beatsQuery.isLoading.value
  && !edgesQuery.isLoading.value
  && !objectivesQuery.isLoading.value
  && !consequencesQuery.isLoading.value
  && !gatesQuery.isLoading.value
));
const consistencyFindings = computed(() => deriveQuestConsistency({
  beats: beats.value,
  edges: edges.value,
  objectives: objectivesQuery.data.value ?? [],
  consequences: consequencesQuery.data.value ?? [],
  gates: gatesQuery.data.value ?? [],
}));

function workLinkFor(beatId: string) {
  return { query: { ...route.query, view: "work", beat: beatId } };
}

async function createOpeningBeat() {
  creating.value = true;
  createError.value = "";
  try {
    const created = await createBeatWithRoute.mutateAsync({
      questId: questId.value,
      title: "Opening beat",
      kind: "neutral",
      canvasX: 0,
      canvasY: 0,
    });
    await router.push(workLinkFor(created.id));
  } catch (error) {
    createError.value = error instanceof Error ? error.message : "Could not create the opening beat";
  } finally {
    creating.value = false;
  }
}
</script>
