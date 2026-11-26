<template>
  <!-- The Familiar asking, drawn as it draws a reply, with where in the walk this is. -->
  <div class="flex flex-col gap-1.5" data-testid="walk-question">
    <p class="text-eyebrow uppercase text-muted-foreground" data-testid="walk-eyebrow">{{ eyebrow }}</p>
    <p class="text-body text-foreground">{{ item.text }}</p>
    <div v-if="!item.answered && (canDecide || canSkip || isFollowUp)" class="flex flex-wrap gap-1.5" role="group" aria-label="Other ways to answer">
      <AppButton v-if="isFollowUp" variant="outline" size="sm" label="Just give me ideas" data-testid="walk-ideas" @click="emit('ideas')" />
      <AppButton v-else-if="canDecide" variant="outline" size="sm" label="You decide" data-testid="walk-decide" @click="emit('decide')" />
      <AppButton v-if="canSkip" variant="outline" size="sm" label="Skip this one" data-testid="walk-skip-question" @click="emit('skip')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One question of "Design it with me" (#1282). The chips are the two answers that need no words: "You decide" (the
 * Familiar drafts from the pitch, so only where a draft exists, and not for lore, which needs words to be titled) and
 * "Skip this one" (all but the pitch, which every draft is written from). A follow-up, asked when the answer was thin,
 * trades "You decide" for "Just give me ideas": the block opens now with what the DM already said.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { stepOf, type WalkStopRef } from "@/lib/canon/canonWalk";
import { stopEyebrow } from "@/lib/ask/askWalkCopy";
import type { AskItem } from "@/composables/ask/askItems";

const { item, progress = [] } = defineProps<{
  item: Extract<AskItem, { kind: "walk-question" }>;
  progress?: readonly WalkStopRef[];
}>();
const emit = defineEmits<{ decide: []; ideas: []; skip: [] }>();
const isFollowUp = computed(() => item.followUp === true);

const step = computed(() => stepOf(item.stop.step));
const eyebrow = computed(() => stopEyebrow(item.stop, progress));
// Not the pitch: it is written from the DM's own words, and with none the helper would offer the walk's steer as the pitch.
const canDecide = computed(() => step.value.draft !== null && step.value.id !== "lore" && step.value.id !== "pitch");
const canSkip = computed(() => step.value.id !== "pitch");
</script>
