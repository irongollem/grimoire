<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <div>
      <h2 class="font-cinzel text-sm font-semibold tracking-wide text-foreground">Monster Embeddings</h2>
      <p class="text-caption text-muted-foreground italic mt-0.5">
        Drives the embed-monsters backfill (#595) in bounded batches of {{ BATCH_LIMIT }} — one call embeds
        up to {{ BATCH_LIMIT }} stale rows and reports how many remain, so a full pass over the bestiary takes
        dozens of calls. It is resumable by construction (the server recomputes "remaining" fresh each call),
        so an interrupted run is always safe to restart. Changing the embedding vendor or model in the panel
        above runs this automatically -- use the button below to resume an interrupted run, or to re-embed
        without changing the vendor.
      </p>
    </div>

    <div class="flex items-center gap-2">
      <button
        type="button"
        class="px-4 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        :disabled="isRunning"
        @click="runBackfill"
      >
        {{ isRunning ? 'Running…' : 'Re-embed monsters' }}
      </button>
      <button
        v-if="isRunning"
        type="button"
        class="px-3 py-1.5 text-label-lg font-semibold border border-border rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
        :disabled="stopRequested"
        @click="stopBackfill"
      >
        {{ stopRequested ? 'Stopping…' : 'Stop' }}
      </button>
    </div>

    <EmbeddingBackfillStatus />
  </div>
</template>

<script setup lang="ts">
// Admin driver for the embed-monsters batch backfill (#595). The actual loop
// lives in useMonsterEmbeddingBackfill.ts (module-level singleton state) so
// this button and EmbeddingVendorControl.vue's post-apply auto-backfill
// share ONE implementation and ONE in-flight run instead of two copies of
// the same loop.
import { useMonsterEmbeddingBackfill, BATCH_LIMIT } from "@/composables/useMonsterEmbeddingBackfill";
import EmbeddingBackfillStatus from "@/components/admin/EmbeddingBackfillStatus.vue";

const { isRunning, stopRequested, runBackfill, stopBackfill } = useMonsterEmbeddingBackfill();
</script>
