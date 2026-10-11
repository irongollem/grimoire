<template>
  <!-- Desktop: popover anchored to the trigger. Phone: the same list in a bottom sheet. -->
  <SourcesPickerPanel
    v-if="!isMobile"
    scope="player"
    cue-key="player-books"
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
    <span class="relative inline-flex shrink-0">
      <slot name="trigger" :open="sheetOpen" :toggle="toggleSheet" />
      <EntityNewDot
        :is-new="hasCue"
        size="sm"
        title="More library content to explore"
        class="pointer-events-none absolute -top-0.5 -right-0.5"
      />
    </span>
    <MobileSheet v-model:open="sheetOpen" title="Your books">
      <SourcesPickerPanel
        variant="sheet"
        scope="player"
        cue-key="player-books"
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
import { computed, ref } from "vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import SourcesPickerPanel from "@/components/common/settings/SourcesPickerPanel.vue";
import EntityNewDot from "@/components/common/entity/EntityNewDot.vue";
import {
  STANDALONE_LIBRARY_SLUGS,
  useAvailablePlayerBooks,
  useUserEnabledSources,
} from "@/composables/library/useEnabledSources";
import { useSourceCue } from "@/composables/library/useSourceCue";
import { useIsMobile } from "@/composables/useBreakpoint";

const DESCRIPTION = "Turned-on books are used for characters that are not at a table.";
const EMPTY = "No books available yet.";

const isMobile = useIsMobile();
const { data: books, isLoading } = useAvailablePlayerBooks();
const sheetOpen = ref(false);
// On a phone the trigger lives out here, so the dot is computed here too; the
// sheet's own panel marks the books seen when it opens.
const { data: userSources } = useUserEnabledSources();
const enabledBooks = computed(() =>
  userSources.value ? new Set([...STANDALONE_LIBRARY_SLUGS, ...userSources.value.map((e) => e.source_slug)]) : null,
);
const { hasCue } = useSourceCue("player-books", books, enabledBooks);
function toggleSheet() { sheetOpen.value = !sheetOpen.value; }

defineSlots<{ trigger(props: { open: boolean; toggle: () => void }): unknown }>();
</script>
