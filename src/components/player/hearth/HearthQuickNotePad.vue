<template>
  <HearthQuickNoteEditor
    v-if="canEditSessionNote(isSuccess, startedAt) && startedAt !== null"
    :started-at="startedAt"
    :entries="entries ?? []"
  />
  <p
    v-else-if="isError"
    class="torn hearth-card rounded-lg px-3.5 py-3 text-body italic text-muted-foreground"
    role="alert"
  >
    Your notes did not load. Reload to try again.
  </p>
  <BannerLoader v-else class="h-5" />
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import HearthQuickNoteEditor from "./HearthQuickNoteEditor.vue";
import { useMyJournalEntries } from "@/composables/notes/usePlayerJournal";
import { canEditSessionNote } from "@/lib/hearth/sessionNote";

/**
 * Holds the pad shut until it is safe to type: the journal read has settled (so
 * the session's existing entry is found, not duplicated) and the session's start
 * is known. See `canEditSessionNote`.
 */
const { startedAt } = defineProps<{ startedAt: string | null }>();

const { data: entries, isSuccess, isError } = useMyJournalEntries();
</script>
