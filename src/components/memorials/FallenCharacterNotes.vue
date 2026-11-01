<template>
  <section v-if="notes.length > 0" class="flex w-full flex-col gap-3" :aria-label="`From ${name}'s journal`">
    <h3 class="font-fell text-heading-sm italic text-foreground">From {{ name }}'s journal</h3>
    <ul class="flex flex-col gap-3">
      <li v-for="n in notes" :key="n.id" class="rounded-lg border border-border bg-card px-4 py-3">
        <div class="flex items-baseline justify-between gap-3">
          <p class="text-heading-xs font-semibold text-foreground">{{ n.title || "Untitled" }}</p>
          <time class="text-label shrink-0 text-muted-foreground" :datetime="n.created_at">{{ formatDate(n.created_at) }}</time>
        </div>
        <RichTextViewer class="mt-2" :content="n.content" />
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import type { PlayerJournalEntry } from "@/composables/notes/usePlayerJournal";

/**
 * A fallen character's Character notes, read-only, shown with them in the Hall (they leave the
 * live journal when the character falls). Renders nothing when there are none.
 */
defineProps<{ name: string; notes: readonly PlayerJournalEntry[] }>();

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
</script>
