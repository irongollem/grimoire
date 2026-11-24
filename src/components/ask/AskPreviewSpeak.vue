<template>
  <!-- Speak aloud beside "Said it": plays the line in the speaker's voice, a second press stops it, a later one replays it free. -->
  <div class="inline-flex items-center gap-1.5" data-testid="ask-preview-speak">
    <AppButton
      variant="outline"
      size="xs"
      :class="{ 'min-h-11': mobile }"
      :loading="phase === 'loading'"
      :disabled="disabled"
      :label="phase === 'playing' ? 'Stop' : fetched ? 'Play again' : 'Speak aloud'"
      :icon="phase === 'playing' ? IconStop : IconVolume"
      :aria-pressed="phase === 'playing'"
      data-testid="ask-preview-speak-button"
      @click="speech.toggle(line)"
    />
    <!-- Honest about the price: this line's own estimate (its length at the voices' rate); one already fetched is free. -->
    <span v-if="priceText" class="text-caption-sm text-muted-foreground" data-testid="ask-preview-speak-price">{{ priceText }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * Speak aloud on one spoken row (#1273). It holds no state: the adapter's `speech` owns the phase and the clips.
 * `disabled` is the card's busy flag, so a save under way is not talked over.
 */
import { computed } from "vue";
import { IconStop, IconVolume } from "@/lib/icons";
import type { AskLineSpeech } from "@/lib/ask/askAdapter";
import AppButton from "@/components/common/controls/AppButton.vue";

const { speech, line, disabled = false, mobile = false } = defineProps<{ speech: AskLineSpeech; line: number; disabled?: boolean; mobile?: boolean }>();

const phase = computed(() => speech.phase(line));
const fetched = computed(() => speech.isFetched(line));
const priceText = computed(() => {
  if (fetched.value) return "free";
  const credits = speech.price(line);
  return credits === null ? null : `about ${credits} ${credits === 1 ? "credit" : "credits"}`;
});
</script>
