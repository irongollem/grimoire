<template>
  <!-- "You do: your hand, set in from the edge, no box. You say: your hand in a box." (Voices, 02b).
       A box is something said aloud; no box is something done. A question to the Narrator is neither: it is
       the player's, not the character's, so it is set apart by a dotted rule and says who is asked. A correction
       ("That's not what happened") is the player's too, and is drawn the same way under its own words. -->
  <div
    :class="[
      'flex flex-col gap-0.5',
      mode === 'say' ? 'ml-7 border-l-4 border-primary bg-primary/8 px-3.5 pt-2 pb-2.5' : mode === 'ask' || mode === 'correct' ? 'ml-7 border-l border-dotted border-input pl-3.5' : 'pl-7',
    ]"
    :data-play-mode="mode"
    :data-boxed="mode === 'say'"
  >
    <span :class="['text-eyebrow flex items-center gap-1.5', mode === 'say' ? 'text-primary' : 'text-muted-foreground']">
      {{ mode === "ask" ? "You ask the Narrator" : mode === "correct" ? "You set it right" : who }}{{ mode === "say" ? " says" : "" }}
      <AppButton v-if="replayable" variant="ghost" size="inline" :icon="IconVolume" :aria-label="`Hear ${who} say this again`" class="ml-auto" data-testid="solo-replay-player" @click="emit('replay')" />
    </span>
    <p data-hand :class="['solo-hand whitespace-pre-line text-[1.0625rem] leading-6', unsent ? 'text-muted-foreground' : 'text-foreground']">
      {{ mode === "say" ? `“${text}”` : text }}
    </p>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconVolume } from "@/lib/icons";
import type { PlayMode } from "@/lib/table/solo/soloTypes";

const { mode, text, who, unsent = false, replayable = false } = defineProps<{
  mode: PlayMode;
  text: string;
  /** The name of the character being played. */
  who: string;
  /** Sent but not kept: shown muted until it is sent again. */
  unsent?: boolean;
  /** The player's own voice is on and this was said aloud: it offers to be heard again. */
  replayable?: boolean;
}>();
const emit = defineEmits<{ replay: [] }>();
</script>

<style scoped>
/* The hand is the player's; print is everyone else's (Vellum ink, #1031). Other themes keep print. */
:root[data-theme^="vellum"] .solo-hand {
  font-family: "Fondamento", var(--vl-serif);
  color: var(--vl-hand-ink);
}
:root[data-theme^="vellum"] .solo-hand.text-muted-foreground {
  color: var(--muted-foreground);
}
</style>
