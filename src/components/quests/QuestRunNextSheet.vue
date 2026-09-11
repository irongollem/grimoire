<template>
  <MobileSheet v-model:open="open" title="What happens next" show-until="xl">
    <span
      class="mb-3 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-label uppercase"
      :class="[threadBadge.tone.bg, threadBadge.tone.text]"
    >Thread {{ threadBadge.letter }}</span>
    <QuestRunOutcomeStrip
      :status="status"
      :outgoing="outgoing"
      :disabled="disabled"
      headless
      @choose="onChoose"
      @something-else="onSomethingElse"
      @reveal="emit('reveal', $event)"
      @preview="emit('preview', $event)"
    />
  </MobileSheet>
</template>

<script setup lang="ts">
/**
 * "What happens next" as a bottom sheet below `xl` (#872, "Quest Phone
 * Frames", frame 1): the cockpit's rail no longer renders below that
 * breakpoint, so this is the only place the outcome strip mounts on a phone —
 * opened from the dock's primary button. Mounts `QuestRunOutcomeStrip`
 * (same props, same events) rather than a bespoke phone rewrite of it, headless
 * — the sheet's own title already says "What happens next", so the strip's own
 * `<h3>` would double it (review fix 3). The strip's own "Something else…"
 * card already lives inside its body, so there is no separate footer control
 * to surface here.
 *
 * Choosing a route or reaching for "Something else…" closes the sheet itself
 * — the cockpit still does exactly what it does today with either event
 * (opens the Advance dialog preselected or in improvise mode), it just no
 * longer needs to remember to dismiss this sheet on top of that.
 */
import type { QuestRuntimeStatus } from "@/types/quest.types";
import type { QuestRunBranchChoice } from "@/lib/quests/run";
import type { ThreadBadge } from "@/lib/quests/threads";
import MobileSheet from "@/components/common/MobileSheet.vue";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";

defineProps<{
  status: QuestRuntimeStatus;
  outgoing: QuestRunBranchChoice[];
  disabled?: boolean;
  threadBadge: ThreadBadge;
}>();
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{
  choose: [edgeId: string];
  "something-else": [];
  reveal: [beatId: string];
  preview: [beatId: string];
}>();

function onChoose(edgeId: string) {
  open.value = false;
  emit("choose", edgeId);
}
function onSomethingElse() {
  open.value = false;
  emit("something-else");
}
</script>
