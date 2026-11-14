<template>
  <section class="flex min-w-0 flex-col gap-3" aria-label="Prep">
    <h3 class="text-heading-sm font-bold text-foreground">Prep</h3>

    <ul v-if="gaps.length" class="flex flex-wrap gap-1.5" aria-label="Prep gaps">
      <li v-for="gap in gaps" :key="gap.label" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-caption text-ink-caution">
        <span class="mr-1 text-label uppercase">to do</span>{{ gap.label }}
      </li>
    </ul>
    <p v-else class="text-caption italic text-muted-foreground">Nothing left to prepare.</p>

    <QuestBeatIdentityFields
      :beat="beat"
      :kind-options="kindOptions"
      v-model:kind="kindModel"
      :location-options="locationOptions"
      v-model:staged-location-id="stagedLocationId"
      :staged-location-name="stagedLocation?.name ?? ''"
      :staged-site-caption="stagedSiteCaption"
    />
    <p v-if="saveError" role="alert" class="text-caption text-destructive">{{ saveError }}</p>
    <QuestBeatSitePanel :beat="beat" />
    <QuestConvergeControl :beat="beat" />
    <QuestBeatRoutesPanel :beat="beat" :edges="edges" :beats="beats" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useUpdateQuestBeat } from "@/composables/quests/useQuestFlow";
import { childSpaceType, isInteriorType, isSiteType, spaceNoun } from "@/lib/locations/tiers";
import type { QuestBeatPrepGap } from "@/lib/quests/presentation";
import { pluralizeCount } from "@/lib/utils";
import { QUEST_BEAT_KINDS, type QuestBeat, type QuestBeatEdge, type QuestBeatUpdate } from "@/types/quest.types";
import QuestConvergeControl from "../flow/QuestConvergeControl.vue";
import QuestBeatIdentityFields from "../inspector/QuestBeatIdentityFields.vue";
import QuestBeatRoutesPanel from "../inspector/QuestBeatRoutesPanel.vue";
import QuestBeatSitePanel from "../inspector/QuestBeatSitePanel.vue";

/**
 * Frame 10, "Prep": what is still to do for this beat and the details behind it
 * (kind, where it is staged, how routes join, the routes out). Each control
 * saves itself, so nothing here has a Save.
 */
const { beat, edges, beats, gaps } = defineProps<{
  beat: QuestBeat;
  edges: QuestBeatEdge[];
  beats: QuestBeat[];
  gaps: QuestBeatPrepGap[];
}>();

const { locationOptions } = useLocationTree();
const updateBeat = useUpdateQuestBeat();
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
</script>
