<template>
  <section class="flex flex-col gap-2" aria-label="Prep">
    <QuestFoldRow v-model:open="copyOpen" title="Rumor and reveal copy" :caption="caption(copyGaps)" :icon="IconEdit" :tone="tone(copyGaps)">
      <div class="flex flex-col gap-3">
        <QuestBeatIdentityFields
          :beat="beat"
          :kind-options="kindOptions"
          v-model:kind="kindModel"
          v-model:visibility="visibilityModel"
          :location-options="locationOptions"
          v-model:staged-location-id="stagedLocationId"
          :staged-location-name="stagedLocation?.name ?? ''"
          :staged-site-caption="stagedSiteCaption"
        />
        <QuestBeatFields :key="beat.id" :beat="beat" :fill-context="fillContext" />
        <p v-if="saveError" role="alert" class="text-caption text-destructive">{{ saveError }}</p>
      </div>
    </QuestFoldRow>

    <QuestFoldRow v-model:open="attachmentsOpen" title="Attachments" :caption="caption(attachmentGaps)" :icon="IconEntityLink" :tone="tone(attachmentGaps)">
      <div class="flex flex-col gap-3">
        <QuestBeatAttachmentsPanel :beat="beat" :attachments="attachments" />
        <QuestBeatSitePanel :beat="beat" />
      </div>
    </QuestFoldRow>

    <QuestFoldRow v-model:open="payoffsOpen" title="Payoffs and routes" :caption="caption(routeGaps)" :icon="IconShuffle" :tone="tone(routeGaps)">
      <div class="flex flex-col gap-3">
        <QuestPayoffPanel :beat="beat" :edges="edges" :beats="beats" :consequences="consequences" :loot="loot" />
        <QuestBeatRoutesPanel :beat="beat" :edges="edges" :beats="beats" />
      </div>
    </QuestFoldRow>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { useSetBeatVisibility } from "@/composables/quests/useSetBeatVisibility";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { useCampaignStore } from "@/stores/campaign";
import type { BeatFillContext } from "@/lib/quests/beatFill";
import { childSpaceType, isInteriorType, isSiteType, spaceNoun } from "@/lib/locations/tiers";
import type { QuestBeatPrepGap, QuestBeatPrepGapKind } from "@/lib/quests/presentation";
import { pluralizeCount } from "@/lib/utils";
import { IconEdit, IconEntityLink, IconShuffle } from "@/lib/icons";
import {
  QUEST_BEAT_KINDS,
  type LootPlacement,
  type Quest,
  type QuestBeat,
  type QuestBeatAttachmentSummary,
  type QuestBeatEdge,
  type QuestBeatUpdate,
  type QuestBeatVisibility,
  type QuestConsequence,
  type QuestThread,
} from "@/types/quest.types";
import QuestFoldRow from "../board/QuestFoldRow.vue";
import QuestBeatAttachmentsPanel from "../inspector/QuestBeatAttachmentsPanel.vue";
import QuestBeatFields from "../inspector/QuestBeatFields.vue";
import QuestBeatIdentityFields from "../inspector/QuestBeatIdentityFields.vue";
import QuestBeatRoutesPanel from "../inspector/QuestBeatRoutesPanel.vue";
import QuestBeatSitePanel from "../inspector/QuestBeatSitePanel.vue";
import QuestPayoffPanel from "../inspector/QuestPayoffPanel.vue";

/**
 * The opened beat's prep, at the foot (#1183, frame 04): three folds, no
 * Play/Prep switch. They start closed while the party stands at the beat and
 * open when it is elsewhere, since that is when the DM is preparing it. Every
 * panel inside saves itself the way it always did; nothing here has a Save.
 */
const { beat, partyHere, quest, threads, edges, beats, consequences, loot, attachments, gaps } = defineProps<{
  beat: QuestBeat;
  partyHere: boolean;
  quest: Quest | null;
  threads: QuestThread[];
  edges: QuestBeatEdge[];
  beats: QuestBeat[];
  consequences: QuestConsequence[];
  loot: LootPlacement[];
  attachments: QuestBeatAttachmentSummary[];
  gaps: QuestBeatPrepGap[];
}>();

const copyOpen = ref(!partyHere);
const attachmentsOpen = ref(!partyHere);
const payoffsOpen = ref(!partyHere);
// The party moving on or arriving resets the folds; a fold the DM opened by hand stays put otherwise.
watch(() => partyHere, (here) => { copyOpen.value = attachmentsOpen.value = payoffsOpen.value = !here; });

const GAP_FOLD: Record<QuestBeatPrepGapKind, "copy" | "attachments" | "routes"> = {
  guidance: "copy", player_copy: "copy", improv_review: "copy", attachment: "attachments", site: "attachments", connection: "routes",
};
const gapsFor = (fold: "copy" | "attachments" | "routes") => gaps.filter((gap) => GAP_FOLD[gap.kind] === fold);
const copyGaps = computed(() => gapsFor("copy"));
const attachmentGaps = computed(() => gapsFor("attachments"));
const routeGaps = computed(() => gapsFor("routes"));
const caption = (rows: QuestBeatPrepGap[]) => (rows.length ? `${rows.length} gap${rows.length === 1 ? "" : "s"}` : "");
const tone = (rows: QuestBeatPrepGap[]) => (rows.length ? "caution" as const : "muted" as const);

// ── identity: kind, visibility and staging, each saved at once ──
const campaign = useCampaignStore();
const { locationOptions } = useLocationTree();
const updateBeat = useUpdateQuestBeat();
const setVisibility = useSetBeatVisibility();
const objectivesQuery = useQuestObjectives(computed(() => beat.quest_id));
const saveError = ref("");

async function save(write: () => Promise<unknown>) {
  saveError.value = "";
  try { await write(); } catch (caught) { saveError.value = caught instanceof Error ? caught.message : "Could not save this change"; }
}
const kindOptions = computed<string[]>(() => (QUEST_BEAT_KINDS as readonly string[]).includes(beat.kind) ? [...QUEST_BEAT_KINDS] : [...QUEST_BEAT_KINDS, beat.kind]);
const kindModel = computed<string>({
  get: () => beat.kind || "neutral",
  set: (next) => { if (next !== beat.kind) void save(() => updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, update: { kind: next } satisfies QuestBeatUpdate })); },
});
const visibilityModel = computed<QuestBeatVisibility>({
  get: () => beat.visibility,
  set: (next) => { if (next !== beat.visibility) void save(() => setVisibility(beat, next)); },
});
const stagedLocationId = computed<string>({
  get: () => beat.staged_at_location_id ?? "",
  set: (next) => {
    if ((next || null) !== beat.staged_at_location_id) void save(() => updateBeat.mutateAsync({ id: beat.id, questId: beat.quest_id, update: { staged_at_location_id: next || null } }));
  },
});
const stagedLocation = computed(() => beat.staged_at_location_id ? locationOptions.value.find((row) => row.id === beat.staged_at_location_id) : undefined);
const stagedSiteCaption = computed(() => {
  const place = stagedLocation.value;
  if (!place) return "nowhere yet";
  const site = isSiteType(place.location_type) ? place : place.parent_id ? locationOptions.value.find((row) => row.id === place.parent_id) : undefined;
  if (!site || !isSiteType(site.location_type)) return "not a site; no room surface";
  const { singular, plural } = spaceNoun(site.location_type);
  const count = pluralizeCount(locationOptions.value.filter((row) => row.parent_id === site.id && isInteriorType(row.location_type)).length, singular, plural);
  const demonstrative = childSpaceType(site.location_type) === "grounds" ? "these grounds" : "this room";
  return place.id === site.id ? `site: ${count}` : `opens at ${demonstrative} in ${site.name}: ${count}`;
});

// Absent when AI is off for the campaign, which hides the fill control in `QuestBeatFields`.
const fillContext = computed<BeatFillContext | undefined>(() => {
  if (!campaign.isAiEnabled || !quest) return undefined;
  const byId = new Map(beats.map((row) => [row.id, row]));
  const incomingEdges = edges.filter((edge) => edge.target_beat_id === beat.id);
  const outgoingEdges = edges.filter((edge) => edge.source_beat_id === beat.id);
  return {
    quest,
    beat,
    incoming: incomingEdges.flatMap((edge) => byId.get(edge.source_beat_id) ?? []),
    outgoing: outgoingEdges.flatMap((edge) => byId.get(edge.target_beat_id) ?? []),
    objectives: objectivesQuery.data.value ?? [],
    stagedAt: stagedLocation.value?.name ?? null,
    threadLabel: threads.length > 1 ? (incomingEdges.find((edge) => edge.label)?.label ?? null) : null,
  };
});
</script>
