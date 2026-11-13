<template>
  <div class="space-y-2 rounded-md border border-border bg-muted/40 p-2" role="group" aria-label="Take this route">
    <div class="text-caption">
      <p class="font-semibold text-foreground">Taking it will</p>
      <ul class="text-muted-foreground">
        <li>Mark {{ preview.doneTitle }} done</li>
        <li v-if="preview.opensThread">Open a thread</li>
        <li v-for="(line, index) in preview.payoffs" :key="`p${index}`">{{ line }}</li>
        <li v-for="title in preview.cutOff" :key="title" data-cut-off>{{ title }} becomes unreachable</li>
      </ul>
    </div>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <AppCheckbox v-model="placeParty" :label="partyLabel" label-role="caption" size="sm" />
      <AppCheckbox v-for="item in heldLoot" :key="item.id" :model-value="lootIds" :value="item.id" :label="`Hand out ${item.label}`" label-role="caption" size="sm" @update:model-value="lootIds = $event" />
    </div>
    <AppButton label="Take this route" size="sm" :disabled="threadId === null" :loading="mark.isPending.value" @click="take" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { useLootPlacements, useMarkQuestMove, useQuestConsequences } from "@/composables/quests/useQuestFlow";
import { useQuestObjectives } from "@/composables/quests/useQuests";
import { useToast } from "@/composables/useToast";
import { previewRoute } from "@/lib/quests/moves";
import type { QuestBeatStaging } from "@/lib/quests/presentation";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const { edge, edges, beats, targetStaging = null, threadId = null, sessionId = null } = defineProps<{
  edge: QuestBeatEdge;
  /** Every route of the quest, to find the sibling choices a choice cuts off. */
  edges: QuestBeatEdge[];
  beats: QuestBeat[];
  /** Where the target beat is staged; the party goes there when ticked. */
  targetStaging?: QuestBeatStaging | null;
  /** The focus thread. Null disables the button. */
  threadId?: string | null;
  /** Null lets the server stamp the open session. */
  sessionId?: string | null;
}>();

const toast = useToast();
const mark = useMarkQuestMove();
const { data: consequences } = useQuestConsequences(computed(() => edge.quest_id));
const { data: objectives } = useQuestObjectives(computed(() => edge.quest_id));
const { data: loot } = useLootPlacements({ questId: computed(() => edge.quest_id) });

const placeParty = ref(true);
const lootIds = ref<string[]>([]);

const heldLoot = computed(() => (loot.value ?? []).filter((item) => item.beat_id === edge.target_beat_id && item.dispatched_at === null));
const partyLabel = computed(() => (targetStaging ? `Party here: ${targetStaging.name}` : "Party here"));
const preview = computed(() => previewRoute({
  edge, edges, beats,
  consequences: consequences.value ?? [],
  objectiveLabel: (id) => (id ? objectives.value?.find((objective) => objective.id === id)?.description ?? "Objective removed" : ""),
}));

async function take() {
  if (threadId === null) return;
  try {
    await mark.mutateAsync({
      kind: "route",
      campaignId: edge.campaign_id,
      questId: edge.quest_id,
      threadId,
      sessionId,
      edgeId: edge.id,
      placeParty: placeParty.value,
      dispatchLootIds: lootIds.value,
      // Unticked, the party stays where it is: the server moves them whenever a place is named.
      movePartyTo: placeParty.value ? targetStaging?.locationId ?? null : null,
    });
    lootIds.value = [];
  } catch (e) {
    toast.error(toast.fromError(e));
  }
}
</script>
