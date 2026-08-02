<template>
  <template v-if="isRunning && currentTarget">
    <p class="flex items-center gap-2 text-caption text-muted-foreground">
      <Loader2Icon class="h-4 w-4 text-primary animate-spin shrink-0" />
      <span>
        Re-embedding {{ EMBED_TARGET_LABELS[currentTarget] }} — {{ processedThisTarget }} processed this pass,
        {{ remainingThisTarget ?? '…' }} remaining.
        <template v-if="totalProcessed > processedThisTarget">{{ totalProcessed }} total this run.</template>
      </span>
    </p>
  </template>
  <p v-else-if="errorMsg" class="text-caption text-destructive">{{ errorMsg }}</p>
  <p v-else-if="resultMessage" class="text-caption" :class="resultMessage.kind === 'success' ? 'text-green-500' : 'text-muted-foreground'">
    {{ resultMessage.text }}
  </p>
</template>

<script setup lang="ts">
// Presentational status line for the embed-monsters backfill (#595), reading
// directly off the shared useMonsterEmbeddingBackfill() singleton state.
// Used by both MonsterEmbeddingBackfill.vue (the standalone "Re-embed
// monsters" button) and EmbeddingVendorControl.vue (the post-apply
// auto-backfill), so the run's progress renders identically -- and is
// literally the SAME run -- no matter which component started it.
import { Loader2Icon } from "lucide-vue-next";
import { useMonsterEmbeddingBackfill, EMBED_TARGET_LABELS } from "@/composables/useMonsterEmbeddingBackfill";

const { isRunning, currentTarget, processedThisTarget, remainingThisTarget, totalProcessed, errorMsg, resultMessage } =
  useMonsterEmbeddingBackfill();
</script>
