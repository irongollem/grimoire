<template>
  <section data-tour="player-books" class="space-y-3">
    <h2 class="font-cinzel text-sm font-semibold text-foreground">Your books</h2>
    <div class="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
      <div class="min-w-0 space-y-0.5">
        <p class="text-body text-muted-foreground">
          The books your characters are built from when they are not at a table. A table decides which books it takes.
        </p>
        <p class="text-caption text-foreground" data-testid="books-summary">{{ summary }}</p>
      </div>
      <PlayerBooksPicker>
        <template #trigger="{ open, toggle }">
          <AppButton
            variant="subtle"
            size="sm"
            :active="open"
            :icon="IconLibrary"
            label="Choose books"
            @click="toggle"
          />
        </template>
      </PlayerBooksPicker>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconLibrary } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import PlayerBooksPicker from "@/components/play/PlayerBooksPicker.vue";
import { useUserEnabledSources } from "@/composables/library/useEnabledSources";

const { data: userBooks } = useUserEnabledSources();

// Absent rows mean "still loading", not "none": say nothing rather than "0".
const summary = computed(() => {
  const rows = userBooks.value;
  if (rows === undefined) return "";
  if (rows.length === 0) return "Only the SRDs are on.";
  return `${rows.length} ${rows.length === 1 ? "book" : "books"} on beyond the SRDs.`;
});
</script>
