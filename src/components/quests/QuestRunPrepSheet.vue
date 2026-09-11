<template>
  <MobileSheet v-model:open="open" title="Prep" show-until="xl">
    <SegmentedControl v-model="tab" :options="tabOptions" block />
    <div class="mt-3">
      <QuestRunObjectivesLedger v-if="tab === 'ledger'" :quest-id="questId" :thread-id="threadId" :outgoing="outgoing" :threads="threads" />
      <QuestRunStorySoFar
        v-else-if="tab === 'story'"
        :quest-id="questId"
        :thread-id="threadId"
        :beats="beats"
        :path-so-far="pathSoFar"
        :current-beat-id="currentBeatId"
        :outgoing="outgoing"
        :consequences="consequences"
        :objectives="objectives"
        :threads="threads"
        headless
      />
      <QuestRunOpenChains v-else :chains="chains" :threads="threads" :thread-id="threadId" @switch-thread="emit('switch-thread', $event)" />
    </div>
    <template #footer>
      <AppButton
        :label="`What happens next · ${nextCount}`"
        variant="primary"
        size="lg"
        block
        class="min-h-12"
        :icon="IconLinkAlt"
        @click="emit('open-next')"
      />
    </template>
  </MobileSheet>
</template>

<script setup lang="ts">
/**
 * The cockpit rail — ledger, story so far, open chains — as a bottom sheet
 * below `xl` (#872, "Quest Phone Frames", frame 1): "the rail... stops being
 * a column and becomes one docked Prep button." Below that breakpoint the
 * cockpit's own rail column doesn't mount at all — story C keeps it off the
 * mobile DOM entirely rather than CSS-hiding it, to avoid mounting the same
 * heavy list components twice — so this sheet is the only place they mount
 * on a phone, one at a time behind a segmented tab rather than three stacked
 * cards.
 *
 * The footer's "What happens next" button hands off to the cockpit's other
 * sheet rather than duplicating the outcome strip here — Prep is about
 * everything *except* the current choice.
 *
 * `QuestRunStorySoFar` mounts headless (#872 review fix 3): its tab's own
 * segmented-control label already reads "Story so far", so its own `<h3>`
 * would double it. `QuestRunObjectivesLedger`'s "Objectives" and
 * `QuestRunOpenChains`'s "Also open" name something narrower than their tabs'
 * "Ledger" / "Chains · N", so those two stay exactly as they render elsewhere.
 */
import { computed, ref } from "vue";
import type { CampaignLiveQuest, QuestBeat, QuestConsequence, QuestObjective, QuestRuntimeChoice, QuestThreadCursor } from "@/types/quest.types";
import { IconLinkAlt } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import QuestRunObjectivesLedger from "./QuestRunObjectivesLedger.vue";
import QuestRunStorySoFar from "./QuestRunStorySoFar.vue";
import QuestRunOpenChains from "./QuestRunOpenChains.vue";

const props = defineProps<{
  questId: string;
  threadId: string;
  outgoing: QuestRuntimeChoice[];
  threads: QuestThreadCursor[];
  beats: Array<Pick<QuestBeat, "id" | "title" | "staged_at_location_id">>;
  pathSoFar: Array<Record<string, unknown>>;
  currentBeatId: string | null;
  consequences: QuestConsequence[];
  objectives: QuestObjective[];
  chains: CampaignLiveQuest[];
  nextCount: number;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ "switch-thread": [threadId: string]; "open-next": [] }>();

type PrepTab = "ledger" | "story" | "chains";
const tab = ref<PrepTab>("ledger");
const tabOptions = computed(() => [
  { value: "ledger" as const, label: "Ledger" },
  { value: "story" as const, label: "Story so far" },
  { value: "chains" as const, label: `Chains · ${props.chains.length}` },
]);
</script>
