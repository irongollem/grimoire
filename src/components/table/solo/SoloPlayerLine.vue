<template>
  <!-- "You do: your hand, set in from the edge, no box. You say: your hand in a box." (Voices, 02b).
       A box is something said aloud; no box is something done. -->
  <div
    :class="[
      'flex flex-col gap-0.5',
      mode === 'say' ? 'ml-7 border-l-4 border-primary bg-primary/8 px-3.5 pt-2 pb-2.5' : 'pl-7',
    ]"
    :data-play-mode="mode"
    :data-boxed="mode === 'say'"
  >
    <span :class="['text-eyebrow tracking-widest', mode === 'say' ? 'text-primary' : 'text-muted-foreground']">
      {{ who }}{{ mode === "say" ? " says" : "" }}
    </span>
    <p data-hand :class="['solo-hand whitespace-pre-line text-[1.1875rem] leading-7', unsent ? 'text-muted-foreground' : 'text-foreground']">
      {{ mode === "say" ? `“${text}”` : text }}
    </p>
  </div>
</template>

<script setup lang="ts">
import type { PlayMode } from "@/lib/table/soloTypes";

const { mode, text, who, unsent = false } = defineProps<{
  mode: PlayMode;
  text: string;
  /** The name of the character being played. */
  who: string;
  /** Sent but not kept: shown muted until it is sent again. */
  unsent?: boolean;
}>();
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
