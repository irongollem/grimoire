<template>
  <section class="flex flex-col gap-2.5 border border-border bg-card px-3 py-2.5" :aria-label="title" :data-phase="item.phase" data-testid="walk-block">
    <h3 class="text-label-lg font-semibold text-gold-500">{{ title }}</h3>

    <p v-if="item.phase === 'skipped'" class="text-caption text-muted-foreground" data-testid="walk-skipped">Skipped. You can bring it back from the progress list.</p>
    <p v-else-if="item.phase === 'left'" class="text-caption text-muted-foreground" data-testid="walk-left">Left for later. You can come back to it from the progress list.</p>

    <div v-else-if="item.phase === 'saving' || item.phase === 'drafting'" class="flex items-center gap-2 text-caption text-muted-foreground" role="status" data-testid="walk-working">
      <BannerLoader class="h-4" />
      {{ item.phase === "saving" ? "Writing it into your canon…" : `Your Familiar is writing ${step.title.toLowerCase()}…` }}
    </div>

    <p v-else-if="item.phase === 'saved'" class="text-body" data-testid="walk-saved">
      Written into your canon.
      <AppButton variant="link" size="inline-body" label="See it in the canon" :to="stopChapterPath(item.stop)" />
      <span v-if="step.id === 'species'" class="block text-caption text-muted-foreground" data-testid="walk-stat-block-note">{{ STAT_BLOCK_NOTE }}</span>
    </p>

    <template v-else-if="item.phase === 'drafted'">
      <!-- The proposals are the Canon's own review, on the scope the walk drafted under: Accept writes into the canon. -->
      <CanonReview v-if="draft !== null" v-bind="reviewProps" />
      <p class="text-body text-foreground">Keep what you like. Type what to change, or ask for another.</p>
      <p v-if="item.notice" class="text-body text-destructive" role="alert" data-testid="walk-notice">{{ item.notice }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="outline" size="sm" :label="againLabel" :disabled="price === null" data-testid="walk-again" @click="emit('again')" />
        <AppButton variant="primary" size="sm" label="Next section" data-testid="walk-next" @click="emit('next')" />
      </div>
    </template>

    <!-- open, or failed: the same field and the same three answers, so a failure is retried where it happened. -->
    <template v-else>
      <p v-if="item.phase === 'failed' && item.error" class="text-body text-destructive" role="alert" data-testid="walk-error">{{ item.error }}</p>
      <label class="flex flex-col gap-1">
        <span class="sr-only">Your answer for {{ title }}</span>
        <!-- A model-prompt box stays a plain textarea (CLAUDE.md, Sanctioned Exceptions), set in the DM's hand. -->
        <textarea
          v-model="text"
          data-hand="text"
          rows="3"
          maxlength="4000"
          :placeholder="step.placeholder"
          class="field-sizing-content max-h-60 min-h-16 w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-base leading-6 text-foreground placeholder:font-fell placeholder:italic placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          data-testid="walk-answer"
        />
      </label>
      <p v-if="step.id === 'species'" class="text-caption text-muted-foreground" data-testid="walk-stat-block-note">{{ STAT_BLOCK_NOTE }}</p>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton v-if="step.canWrite" variant="outline" size="sm" label="Write it myself" :disabled="text.trim() === ''" data-testid="walk-write" @click="emit('write', text)" />
        <AppButton v-else variant="outline" size="sm" :label="`Open ${step.title}`" :to="stopChapterPath(item.stop)" data-testid="walk-open-chapter" />
        <p v-if="held !== null" class="min-w-0 flex-1 text-caption text-muted-foreground" data-testid="walk-held">{{ held }}</p>
        <AppButton v-else variant="primary" size="sm" :label="enhanceLabel" :disabled="price === null" data-testid="walk-enhance" @click="emit('enhance', text)" />
        <AppButton v-if="canSkip" variant="subtle" size="sm" label="Skip" data-testid="walk-skip" @click="emit('skip')" />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * The section the DM's answer became (#1282), one card in the thread. Three answers, in one row: write it as it stands
 * (no model, free), Enhance with AI (priced on its button, before anything is spent) or skip. After a draft the card
 * is the Canon's own review of it, mounted on the same helper and scope the walk drafted under.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import CanonReview from "@/components/canon/CanonReview.vue";
import { useCanonSuggestionsQuote } from "@/composables/ai/quotes/canonSuggestionsQuote";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import type { AskItem } from "@/composables/ask/askItems";
import { creditsText, showsPrice } from "@/lib/ask/askCredits";
import { stopChapterPath, stopTitle } from "@/lib/ask/askWalkCopy";
import { draftHeldBecause, stepOf, walkScope } from "@/lib/canon/canonWalk";
import type { CanonEntry } from "@/types/canon.types";

const { item, pitchWritten, speciesKept } = defineProps<{
  item: Extract<AskItem, { kind: "walk-block" }>;
  /** Every draft is written from the pitch: before it, Enhance is replaced by why. */
  pitchWritten: boolean;
  /** A habitat is drafted from the field guide's species: before one, Enhance is replaced by why. */
  speciesKept: boolean;
}>();
const emit = defineEmits<{ write: [text: string]; enhance: [text: string]; again: []; next: []; skip: [] }>();

/** The Field guide says where a species' stat block comes from, so the walk does not seem to leave it out. */
const STAT_BLOCK_NOTE = "A species' stat block is made from its form in the Field guide.";

const step = computed(() => stepOf(item.stop.step));
const title = computed(() => stopTitle(item.stop));
const draft = computed(() => step.value.draft);
const held = computed(() => draftHeldBecause(step.value, pitchWritten, speciesKept));
const canSkip = computed(() => step.value.id !== "pitch");

// The DM's words, editable until the block is saved; a retry after a failure starts from what they last wrote.
const text = ref(item.answer);
watch(() => item.answer, (answer) => { text.value = answer; });

const quoteOf = useCanonSuggestionsQuote();
const price = computed(() => (draft.value === null ? null : (quoteOf(draft.value.mode).total ?? null)));
// A draft's price is on its button only when notable; a cheap one is said once in the walk's opening and totalled in its progress line.
const enhanceLabel = computed(() => (showsPrice(price.value) ? `Enhance with AI · ${creditsText(price.value)}` : "Enhance with AI"));
const againLabel = computed(() => (showsPrice(price.value) ? `Again · ${creditsText(price.value)}` : "Again"));

const PART_OF_MODE = { premise: "premise", truths: "truth", forces: "force", secrets: "secret", questions: "question", lore: "lore" } as const;
const { data: allEntries } = useCanonEntries();
const reviewEntries = computed<CanonEntry[]>(() => {
  const mode = draft.value?.mode;
  if (mode === undefined || !(mode in PART_OF_MODE)) return [];
  const part = PART_OF_MODE[mode as keyof typeof PART_OF_MODE];
  return (allEntries.value ?? []).filter((e) => e.part === part);
});
const reviewProps = computed(() => {
  const mode = draft.value!.mode;
  return {
    mode,
    scope: walkScope(item.stop),
    entries: reviewEntries.value,
    ...(mode === "backstory" ? { partyMemberId: item.stop.memberId } : {}),
    // Exactly what the lore chapter hands its review: a draft that is not yet an entry.
    ...(mode === "lore" ? { lore: { title: "", kind: null, entryId: null, text: "" } } : {}),
  };
});
</script>
