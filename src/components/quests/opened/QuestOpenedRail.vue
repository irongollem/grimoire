<template>
  <aside class="flex min-w-0 flex-col gap-3" aria-label="Quest state at this beat">
    <QuestRunObjectivesLedger :quest-id="questId" :thread-id="threadId" :outgoing="context?.outgoing ?? NO_CHOICES" :threads="context?.threads ?? NO_THREADS" />
    <QuestRunClocks :quest-id="questId" />
    <QuestRunHeldPayoff
      v-if="heldLoot.length || (context?.held.length ?? 0) > 0"
      :campaign-id="campaignId"
      :quest-id="questId"
      :loot="heldLoot"
      :held="context?.held ?? NO_HELD"
    />
    <section class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Players see">
      <h3 class="text-heading-sm font-bold text-foreground">Players see</h3>
      <p class="text-body text-foreground">{{ QUEST_BEAT_VISIBILITY_LABELS[beat.visibility] }}</p>
      <div class="flex flex-wrap gap-2">
        <AppButton
          v-if="beat.visibility !== 'revealed'"
          :label="beat.visibility === 'rumored' ? 'Reveal fully' : 'Reveal to players'"
          size="sm"
          variant="primary"
          @click="emit('reveal')"
        />
        <AppButton label="Preview" :icon="IconReveal" size="sm" variant="subtle" @click="emit('preview')" />
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { QUEST_BEAT_VISIBILITY_LABELS } from "@/lib/quests/presentation";
import { IconReveal } from "@/lib/icons";
import type { LootPlacement, QuestBeat, QuestHeldPayoff, QuestRuntimeChoice, QuestRuntimeContext, QuestThreadCursor } from "@/types/quest.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import QuestRunClocks from "../run/QuestRunClocks.vue";
import QuestRunHeldPayoff from "../run/QuestRunHeldPayoff.vue";
import QuestRunObjectivesLedger from "../run/QuestRunObjectivesLedger.vue";

/** The right column: objectives, clocks, what waits on the DM, and what players see. */
defineProps<{
  questId: string;
  campaignId: string;
  threadId: string;
  beat: QuestBeat;
  context: QuestRuntimeContext | null;
  heldLoot: LootPlacement[];
}>();
const emit = defineEmits<{ reveal: []; preview: [] }>();

const NO_CHOICES: QuestRuntimeChoice[] = [];
const NO_THREADS: QuestThreadCursor[] = [];
const NO_HELD: QuestHeldPayoff[] = [];
</script>
