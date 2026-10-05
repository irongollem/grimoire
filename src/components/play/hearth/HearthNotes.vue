<template>
  <HearthSection title="Your notes">
    <template #end>
      <RouterLink
        :to="{ name: 'play-journal', query: { tab: 'mine' } }"
        class="inline-flex items-center gap-1 text-eyebrow text-primary hover:underline"
      >
        <IconAdd class="h-3.5 w-3.5" aria-hidden="true" />New entry
      </RouterLink>
    </template>

    <ul v-if="notes.length" class="torn hearth-card divide-y divide-border/60 rounded-lg">
      <li v-for="note in notes" :key="note.id">
        <component
          :is="note.to ? RouterLink : 'div'"
          :to="note.to ?? undefined"
          class="block min-h-11 px-3.5 py-2.5"
          :class="note.to ? 'hover:bg-accent/40' : ''"
        >
          <span class="flex items-baseline justify-between gap-2">
            <span class="min-w-0 truncate text-eyebrow text-muted-foreground">{{ note.label }}</span>
            <span class="shrink-0 text-caption italic text-muted-foreground">{{ VISIBILITY[note.visibility] }}</span>
          </span>
          <span class="mt-0.5 line-clamp-2 block text-body">{{ note.excerpt }}</span>
        </component>
      </li>
    </ul>
    <BannerLoader v-else-if="isLoading" class="h-5" />
    <p v-else class="torn hearth-card rounded-lg px-3.5 py-3 text-body italic text-muted-foreground">
      Nothing written yet.
    </p>
  </HearthSection>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import HearthSection from "@/components/play/hearth/HearthSection.vue";
import { useMyRecentNotes, type RecentNote } from "@/composables/notes/useMyRecentNotes";
import { IconAdd } from "@/lib/icons";

/** The player's own latest words, with who can read each. */
const VISIBILITY: Record<RecentNote["visibility"], string> = {
  private: "Only you",
  party: "Party",
  dm: "Shared with DM",
};

const { notes, isLoading } = useMyRecentNotes(3);
</script>
