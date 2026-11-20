<template>
  <CanonLedgerRow :id="`canon-entry-${entry.id}`" :label="entry.title" :selected="selected" layout="flex-col gap-1 sm:flex-row sm:items-start sm:gap-3" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground">{{ entry.title }}</span>
      <span class="mt-1 block text-label text-muted-foreground" data-testid="secret-tally">{{ clueTally(clues) }}</span>
    </span>
    <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold text-foreground sm:mt-0.5" data-testid="secret-state">
      <span aria-hidden="true">{{ SECRET_STATE_MARK[state] }}</span>
      {{ SECRET_STATE_LABEL[state] }}
    </span>
  </CanonLedgerRow>
</template>

<script setup lang="ts">
import CanonLedgerRow from "./CanonLedgerRow.vue";
import { computed } from "vue";
import { SECRET_STATE_LABEL, SECRET_STATE_MARK, clueTally, secretState } from "@/lib/canon/canonSecrets";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const { entry, clues, selected = false } = defineProps<{ entry: CanonEntry; clues: readonly CanonClue[]; selected?: boolean }>();
const emit = defineEmits<{ select: [] }>();

const state = computed(() => secretState(entry, clues));
</script>
