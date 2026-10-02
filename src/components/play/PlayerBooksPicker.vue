<template>
  <!-- Desktop: popover anchored to the trigger. Phone: the same list in a bottom sheet. -->
  <SourcesPickerPanel
    v-if="!isMobile"
    scope="player"
    title="Your books"
    :description="DESCRIPTION"
    :empty-message="EMPTY"
    :available-sources="books"
    :is-loading="isLoading"
  >
    <template #trigger="{ open, toggle }">
      <slot name="trigger" :open="open" :toggle="toggle" />
    </template>
  </SourcesPickerPanel>
  <template v-else>
    <slot name="trigger" :open="sheetOpen" :toggle="toggleSheet" />
    <MobileSheet v-model:open="sheetOpen" title="Your books">
      <SourcesPickerPanel
        variant="sheet"
        scope="player"
        :description="DESCRIPTION"
        :empty-message="EMPTY"
        :available-sources="books"
        :is-loading="isLoading"
      />
    </MobileSheet>
  </template>
</template>

<script setup lang="ts">
// The player's own book picker (not a table's): one place that decides popover
// versus sheet, so the pool page and the character wizard cannot drift apart.
import { ref } from "vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import SourcesPickerPanel from "@/components/common/SourcesPickerPanel.vue";
import { useAvailablePlayerBooks } from "@/composables/library/useEnabledSources";
import { useIsMobile } from "@/composables/useBreakpoint";

const DESCRIPTION = "Turned-on books are used for characters that are not at a table.";
const EMPTY = "No books available yet.";

const isMobile = useIsMobile();
const { data: books, isLoading } = useAvailablePlayerBooks();
const sheetOpen = ref(false);
function toggleSheet() { sheetOpen.value = !sheetOpen.value; }

defineSlots<{ trigger(props: { open: boolean; toggle: () => void }): unknown }>();
</script>
