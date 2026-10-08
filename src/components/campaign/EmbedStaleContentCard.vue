<template>
  <div v-if="total > 0" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-4 py-3 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">AI Search Index</span>
    </div>
    <div class="p-4 flex flex-col gap-3">
      <p class="text-caption text-muted-foreground italic">
        {{ summary }} The loot generator, encounter suggester and other retrieval-backed generators will not
        offer content that is not indexed.
        <template v-if="outdatedSentence">{{ outdatedSentence }}</template>
        <template v-if="missingTotal > 0">
          Unindexed content usually follows a campaign transfer, since a handed-over campaign's cloned items and
          NPCs arrive without an index.
        </template>
        Indexing is free and can be run any time.
      </p>

      <p v-if="partialResultMessage" class="text-caption text-ink-caution ">
        {{ partialResultMessage }}
      </p>

      <div>
        <AppButton
          variant="primary"
          size="sm"
          :loading="isRunning"
          :label="buttonLabel"
          @click="onIndex"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The permanent home for the embedding offer (#841, widened by #848 from "no
 * vector" to "no vector or an out-of-date one"): the campaign's AI settings, so a DM who dismissed the dashboard banner (or
 * never saw it, having arrived here directly) can still find and act on it.
 * Rendered by AiTab.vue only while there is something to show; unlike the
 * banner there is no dismissal here, because "index later" already has an
 * answer — leave the button unclicked — and a settings tab is not a surface
 * that needs to defend itself against being seen again.
 *
 * Reads the same `useStaleEmbeddings()` composable as
 * EmbedStaleContentBanner.vue on purpose, so the two surfaces can never
 * disagree about the count or the copy.
 */
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { useToast } from "@/composables/useToast";
import { useStaleEmbeddings, STALE_EMBEDDING_KIND_LABELS } from "@/composables/ai/useStaleEmbeddings";

const { counts, total, outdatedTotal, isRunning, progress, lastResult, indexAll } = useStaleEmbeddings();
const toast = useToast();

const missingTotal = computed(() => counts.value.reduce((sum, row) => sum + row.missing, 0));

// "3 NPCs and 2 notes need indexing for AI search." / "1 item needs indexing
// for AI search." Built from whichever kinds are stale, so a campaign with
// only NPCs never reads "0 items, 2 NPCs".
const summary = computed(() => {
  const parts = counts.value.map((row) => `${row.ids.length} ${STALE_EMBEDDING_KIND_LABELS[row.kind]}`);
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${list} ${total.value === 1 ? "needs" : "need"} indexing for AI search.`;
});

// Only said when something was indexed once and has since changed: a row that
// was never indexed has no old text to match.
const outdatedSentence = computed(() => {
  const n = outdatedTotal.value;
  if (n === 0) return null;
  if (total.value === 1) return "It changed after it was last indexed, so search still matches its old text.";
  const which = n === total.value ? (n === 2 ? "Both" : "All") : `${n} of them`;
  return `${which} changed after ${n === 1 ? "it was" : "they were"} last indexed, so search still matches ${n === 1 ? "its" : "their"} old text.`;
});

const buttonLabel = computed(() => {
  if (!isRunning.value) return "Index these";
  return progress.value.total > 0 ? `Indexing… (${progress.value.done}/${progress.value.total})` : "Indexing…";
});

// A fully successful run drops `total` to zero, which unmounts this card (the
// success feedback is the toast below, fired from onIndex). A run with
// failures leaves rows still missing, so the card stays up -- that's the case
// this message is for: it names what happened and invites a retry, which
// simply re-runs indexAll() against whatever is still stale.
const partialResultMessage = computed(() => {
  const result = lastResult.value;
  if (!result) return null;

  // Two different outcomes, and telling them apart is the point. A daily
  // ceiling is not a failure and must not read as one: nothing is lost, the
  // rest is still listed above, and tomorrow's run finishes it. Saying
  // "1,800 failed" for a limit that worked exactly as intended would send a
  // DM hunting a problem that does not exist.
  if (result.remaining > 0) {
    return `Indexed ${result.indexed}. The daily indexing allowance is spent, so ${result.remaining} `
      + `${result.remaining === 1 ? "row is" : "rows are"} still waiting; they stay listed here and can be `
      + `indexed tomorrow.`;
  }

  if (result.failed === 0) return null;
  return `Indexed ${result.indexed}, ${result.failed} failed. Click Index these again to retry the rest.`;
});

async function onIndex() {
  const result = await indexAll();
  if (result.failed === 0 && result.indexed > 0) {
    toast.success(`Indexed ${result.indexed} ${result.indexed === 1 ? "row" : "rows"} for AI search.`);
  }
}
</script>
