<template>
  <!-- A creation under way: it holds the place of its quote and never the conversation, which carries on below it. -->
  <section
    v-if="state === 'running'"
    class="flex items-center gap-2.5 border border-dashed border-border bg-card/60 px-3 py-2"
    :aria-label="`${action}, under way`"
    aria-live="polite"
    data-testid="ask-pending"
  >
    <BannerLoader class="h-5 shrink-0" />
    <span class="min-w-0 flex-1">
      <span class="block text-body font-semibold text-foreground">{{ action }}…</span>
      <span class="block text-caption text-muted-foreground">Keep asking. It lands at the bottom when it is done.</span>
    </span>
  </section>

  <!--
    Folded: the card once it has run is one line saying what was asked and what it cost. A generation held for a yes
    can be opened again to change an option; a finished one is the way back down to where it landed.
  -->
  <div v-else class="flex flex-col gap-2" data-testid="ask-fold">
    <p class="flex flex-wrap items-center gap-x-1.5 text-caption text-muted-foreground" data-testid="ask-landed">
      <span class="min-w-0 truncate">{{ line }}</span>
      <AppButton
        v-if="state === 'previewing' && editable"
        variant="link"
        size="inline-caption"
        :icon-right="changing ? IconChevronUp : IconChevronDown"
        :aria-expanded="changing"
        label="Change options"
        data-testid="ask-fold-change"
        @click="changing = !changing"
      />
      <AppButton
        v-if="landedAt !== undefined"
        variant="link"
        size="inline-caption"
        :icon="IconChevronDown"
        label="See it below"
        data-testid="ask-landed-jump"
        @click="emit('jump', landedAt)"
      />
    </p>
    <slot v-if="changing && state === 'previewing'" name="options" />
  </div>
</template>

<script setup lang="ts">
/** A confirmed run's place in the thread: under way, then one folded line, and a link to where it landed. */
import { computed, ref } from "vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
import { creditsText } from "@/lib/ask/askCredits";
import { keptLine } from "@/composables/ask/askItems";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";

const { state, action, asked = "", credits, landedAt, landedName = null, editable = false, kept = 0, noun = "record" } = defineProps<{
  state: "running" | "previewing" | "discarded" | "done" | "failed";
  action: string;
  /** What the DM asked for, in their words. */
  asked?: string;
  /** What the run has cost so far; a free run says nothing. */
  credits?: number;
  landedAt?: number;
  landedName?: string | null;
  /** On a discarded generation: how many records its row presses had already made, and what the generator calls one. */
  kept?: number;
  noun?: string;
  /** A held generation whose options can be opened again (the card gives them in the `options` slot). */
  editable?: boolean;
}>();
const emit = defineEmits<{ jump: [itemId: number] }>();

const changing = ref(false);

/** The one line: what was made or asked, and what it cost. */
const line = computed(() => {
  const cost = credits !== undefined && credits > 0 ? ` · ${creditsText(credits)}` : "";
  if (state === "done") return `${landedName ?? action} is ready.${cost}`;
  if (state === "failed") return `${action} did not finish.${cost}`;
  if (state === "discarded") return `${action}, discarded. ${kept > 0 ? keptLine(kept, noun) : "Nothing was saved."}${cost}`;
  return `${action}${asked !== "" ? `: ${asked}` : ""}${cost}`;
});
</script>
