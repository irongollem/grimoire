<template>
  <template v-if="book.available.value">
    <AppButton
      variant="outline"
      size="sm"
      :icon="IconOpenBook"
      label="Add to Open Book"
      tooltip="Puts the selected entries in the next release. Entries the book cannot take yet are skipped"
      :disabled="busy || book.busy.value || count === 0"
      @click="book.add()"
    />
    <AppButton
      variant="outline"
      size="sm"
      label="Take out of Open Book"
      :disabled="busy || book.busy.value || count === 0"
      @click="book.remove()"
    />
  </template>
</template>

<script setup lang="ts">
/**
 * The Open Book pair for a list's bulk bar (#1085), slotted into `BulkScopeBar`. Renders nothing for anyone but the
 * campaign owner, or before the campaign has a book.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useBulkOpenBook } from "@/composables/openBook/useBulkOpenBook";
import { IconOpenBook } from "@/lib/icons";
import type { OpenBookEntityType } from "@/types/openBook.types";

const { entityType, noun, selectedIds, isEligible, busy = false } = defineProps<{
  entityType: OpenBookEntityType;
  noun: string;
  selectedIds: readonly string[];
  /** Whether the book can take this entry now, by the rule for its kind. */
  isEligible: (id: string, partyIds: readonly string[]) => boolean;
  /** The bar's own busy state (a move in flight). */
  busy?: boolean;
}>();

const count = computed(() => selectedIds.length);
const book = useBulkOpenBook({
  entityType,
  noun,
  selectedIds: () => selectedIds,
  isEligible: (id, partyIds) => isEligible(id, partyIds),
});
</script>
