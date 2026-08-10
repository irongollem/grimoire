<template>
  <section class="space-y-3" aria-label="Quest Run mode">
    <header class="flex flex-wrap items-center gap-2">
      <div>
        <p class="text-label font-bold uppercase tracking-wider text-primary">Session cockpit</p>
        <p class="text-caption text-muted-foreground">Stay in the story; supporting material opens with a return path.</p>
      </div>
      <div class="ml-auto flex gap-2">
        <AppButton :to="`/quests/${anchorQuestId}`" label="Quest details" size="sm" variant="subtle" />
        <AppButton :to="`/quests/${anchorQuestId}?mode=build&focus=current`" label="Build" size="sm" variant="subtle" />
      </div>
    </header>

    <div v-if="contextQuery.isLoading.value" class="flex justify-center py-16"><LoadingSpinner /></div>
    <div v-else-if="contextQuery.error.value" class="rounded-xl border border-destructive/40 p-4">
      <p class="text-body text-destructive">The session position could not be loaded. Nothing was changed.</p>
      <AppButton class="mt-2" label="Retry" size="sm" variant="destructive" @click="contextQuery.refetch()" />
    </div>

    <template v-else-if="context?.current && context.state">
      <div v-if="context.state.status === 'paused'" class="rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">
        Session paused. Prep remains available; resume when the table is ready.
      </div>
      <div class="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <QuestRunBeatCard :anchor-quest-id="anchorQuestId" :beat="context.current" :attachments="currentAttachments" :loot="currentLoot" @dirty="containedDirty = $event" />
        <QuestRunPath :path="context.path_so_far" />
      </div>

      <QuestRunJumpPanel v-if="jumpOpen" v-model="jumpSearch" :targets="rankedJumpTargets" @close="jumpOpen = false" @jump="jump" />
      <QuestRunImprovPanel v-if="improvOpen" @close="improvOpen = false" @submit="improvise" />
      <QuestRunControls
        :status="context.state.status"
        :has-previous="!!context.previous"
        :outgoing="branchChoices"
        :disabled="transitioning"
        @previous="command('previous')"
        @advance="(edgeId) => command('advance', { edgeId })"
        @reveal="revealChoice"
        @jump="jumpOpen = !jumpOpen"
        @improv="improvOpen = !improvOpen"
        @pause="command('pause')"
        @resume="command('resume')"
        @end="endSession"
      />
    </template>

    <div v-else class="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 class="font-cinzel text-lg font-bold text-foreground">Start the session flow</h2>
        <p class="text-body text-muted-foreground">Choose the first prepared beat. This does not reveal anything to players.</p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <EntityCombobox v-model="startBeatId" :options="startOptions" placeholder="Choose a starting beat…" />
        <AppButton label="Start run" variant="primary" :disabled="!startBeatId || transitioning" @click="start" />
      </div>
      <QuestRunPath v-if="context?.path_so_far.length" :path="context.path_so_far" />
    </div>

    <p v-if="error" role="alert" class="rounded-md border border-destructive/40 p-2 text-caption text-destructive">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { refDebounced } from "@vueuse/core";
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useHotkeys } from "@/composables/useHotkeys";
import {
  useQuestBeatAttachmentSummaries,
  useQuestBeatLoot,
  useQuestBeats,
  useCreateQuestBeat,
  useDeleteQuestBeat,
  useQuestRuntimeCommand,
  useQuestRuntimeContext,
  useQuestRuntimeJumpTargets,
  useUpdateQuestBeat,
} from "@/composables/useQuestFlow";
import { useQuests } from "@/composables/useQuests";
import { rankQuestJumpTargets, type RankedQuestJumpTarget } from "@/lib/quests/run";
import type { QuestRuntimeCommand } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import QuestRunBeatCard from "./QuestRunBeatCard.vue";
import QuestRunControls from "./QuestRunControls.vue";
import QuestRunJumpPanel from "./QuestRunJumpPanel.vue";
import QuestRunImprovPanel from "./QuestRunImprovPanel.vue";
import QuestRunPath from "./QuestRunPath.vue";

const props = defineProps<{ anchorQuestId: string }>();
const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const contextQuery = useQuestRuntimeContext();
const runtimeCommand = useQuestRuntimeCommand();
const beatsQuery = useQuestBeats(computed(() => props.anchorQuestId));
const questsQuery = useQuests();
const currentQuestId = computed(() => contextQuery.data.value?.current?.quest_id ?? "");
const runBeatsQuery = useQuestBeats(currentQuestId);
const attachmentsQuery = useQuestBeatAttachmentSummaries(currentQuestId);
const lootQuery = useQuestBeatLoot(currentQuestId);
const jumpSearch = ref("");
const debouncedJumpSearch = refDebounced(jumpSearch, 250);
const jumpTargetsQuery = useQuestRuntimeJumpTargets(debouncedJumpSearch);
const jumpOpen = ref(false);
const improvOpen = ref(false);
const startBeatId = ref("");
const transitioning = ref(false);
const error = ref("");
const containedDirty = ref(false);
const updateBeat = useUpdateQuestBeat();
const createBeat = useCreateQuestBeat();
const deleteBeat = useDeleteQuestBeat();

const context = computed(() => contextQuery.data.value ?? null);
const startOptions = computed(() => (beatsQuery.data.value ?? []).map((beat) => ({ id: beat.id, name: beat.title || "Untitled beat" })));
const currentAttachments = computed(() => (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === context.value?.current?.id));
const currentLoot = computed(() => (lootQuery.data.value ?? []).filter((row) => row.beat_id === context.value?.current?.id));
const recentBeatIds = computed(() => {
  const ids = (context.value?.path_so_far ?? []).map((row) => String(row.to_beat_id ?? "")).filter(Boolean).reverse();
  return [...new Set(ids)];
});
const branchChoices = computed(() => {
  const visited = new Set(recentBeatIds.value);
  const beats = new Map((runBeatsQuery.data.value ?? []).map((beat) => [beat.id, beat]));
  return (context.value?.outgoing ?? []).map((choice) => {
    const beat = beats.get(choice.beat_id);
    return {
      ...choice,
      visibility: beat?.visibility ?? "hidden" as const,
      presentationHint: beat?.presentation_hint ?? null,
      prepGapCount: (attachmentsQuery.data.value ?? []).filter((row) => row.beat_id === choice.beat_id && row.prep_gap).length,
      isVisited: visited.has(choice.beat_id),
    };
  });
});
const rankedJumpTargets = computed(() => rankQuestJumpTargets(
  (jumpTargetsQuery.data.value ?? []).filter((target) => target.beat_id !== context.value?.current?.id), questsQuery.data.value ?? [], context.value?.current?.quest_id ?? null,
  props.anchorQuestId, recentBeatIds.value,
));

watch(() => context.value?.current?.id, (beatId) => {
  containedDirty.value = false;
  if (!beatId || route.query.mode !== "run" || route.query.beat === beatId) return;
  void router.replace({ query: { ...route.query, mode: "run", beat: beatId } });
}, { immediate: true });

async function run(input: Parameters<typeof runtimeCommand.mutateAsync>[0]) {
  transitioning.value = true;
  error.value = "";
  try {
    const result = await runtimeCommand.mutateAsync(input);
    jumpOpen.value = false;
    improvOpen.value = false;
    return result;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "The session position could not be changed";
    await contextQuery.refetch();
    return null;
  } finally { transitioning.value = false; }
}

async function command(kind: QuestRuntimeCommand, extra: { edgeId?: string } = {}) {
  const state = context.value?.state;
  if (!state) return;
  if (["previous", "advance", "end"].includes(kind) && !(await confirmLeavingDraft())) return;
  await run({ campaignId: state.campaign_id, command: kind, expectedVersion: state.version, ...extra });
}

async function start() {
  const beat = beatsQuery.data.value?.find((row) => row.id === startBeatId.value);
  const state = context.value?.state;
  if (!beat) return;
  await run({ campaignId: beat.campaign_id, command: "start", expectedVersion: state?.version ?? 0, targetQuestId: beat.quest_id, targetBeatId: beat.id });
}

async function jump(target: RankedQuestJumpTarget, reason: string, pushReturn: boolean) {
  const state = context.value?.state;
  if (!state || !(await confirmLeavingDraft())) return;
  await run({
    campaignId: state.campaign_id, command: "jump", expectedVersion: state.version,
    targetQuestId: target.quest_id, targetBeatId: target.beat_id, reason, pushReturn,
    provenance: { surface: "quest-run-jump" },
  });
}

async function improvise(value: { title: string; reason: string; dmLead: string; pushReturn: boolean }) {
  const current = context.value?.current;
  const state = context.value?.state;
  if (!current || !state || !(await confirmLeavingDraft())) return;
  let createdId = "";
  try {
    const created = await createBeat.mutateAsync({
      quest_id: current.quest_id, campaign_id: current.campaign_id, title: value.title, kind: "neutral", visibility: "hidden",
      dm_content: value.dmLead || null, read_aloud: null, how_it_plays: null, outcomes: null, consequences: null,
      rumor_text: null, reveal_text: null, presentation_hint: "Improvised at the table",
      canvas_x: current.canvas_x + 320, canvas_y: current.canvas_y + 160, is_improvised: true,
    });
    createdId = created.id;
    const moved = await run({
      campaignId: state.campaign_id, command: "improv", expectedVersion: state.version,
      targetQuestId: created.quest_id, targetBeatId: created.id, reason: value.reason, pushReturn: value.pushReturn,
      provenance: { surface: "quest-run-improv" },
    });
    if (!moved) await deleteBeat.mutateAsync({ id: created.id, questId: created.quest_id });
  } catch (caught) {
    if (createdId) {
      try { await deleteBeat.mutateAsync({ id: createdId, questId: current.quest_id }); } catch { /* Preserve the actionable create error. */ }
    }
    error.value = caught instanceof Error ? caught.message : "The improvised beat could not be created";
  }
}

async function endSession() {
  if (!(await confirm("End this quest session? The visit history will remain available."))) return;
  await command("end");
}

async function revealChoice(beatId: string) {
  const beat = runBeatsQuery.data.value?.find((row) => row.id === beatId);
  if (!beat || !(await confirm(`Reveal “${beat.title}” to players? Advancing alone leaves it ${beat.visibility}.`))) return;
  error.value = "";
  try {
    await updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, expectedUpdatedAt: beat.updated_at, update: { visibility: "revealed" } });
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "The player reveal could not be changed";
  }
}

async function confirmLeavingDraft() {
  if (!containedDirty.value) return true;
  return confirm("Discard the unprepared loot fields and leave this beat?");
}

useHotkeys(computed(() => [
  { combo: "alt+arrowleft", description: "Previous quest beat", handler: () => void command("previous") },
  { combo: "alt+arrowright", description: "Advance to the only next beat", handler: () => {
    const edge = context.value?.outgoing.length === 1 ? context.value.outgoing[0] : null;
    if (edge) void command("advance", { edgeId: edge.edge_id });
  } },
  { combo: "j", description: "Jump to another quest beat", handler: () => { jumpOpen.value = true; } },
]), { layer: "page", enabled: computed(() => context.value?.state?.status === "running" && !transitioning.value && !jumpOpen.value && !improvOpen.value) });
</script>
