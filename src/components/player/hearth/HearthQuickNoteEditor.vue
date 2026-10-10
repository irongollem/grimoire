<template>
  <div class="torn bg-card border rounded-lg flex flex-col gap-2.5 p-3.5">
    <RichTextEditor
      :key="revision"
      v-model="draft.content"
      toolbar="focus"
      size="sm"
      placeholder="Jot something down. It saves itself."
    />
    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <AppCheckbox v-model="draft.sharedWithDm" size="sm" label-role="label" label="Share with DM" />
      <AutosaveStatus :status="status" :error="saveError" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import {
  useCreateJournalEntry,
  useUpdateJournalEntry,
  type PlayerJournalEntry,
} from "@/composables/notes/usePlayerJournal";
import { isBlankNote } from "@/composables/notes/useMyEntityNote";
import { useAutosave } from "@/composables/useAutosave";
import { findSessionNote, sessionNoteTitle, SESSION_NOTE_CATEGORY } from "@/lib/hearth/sessionNote";

/**
 * The editor of a jotting pad for this sitting, saving itself into the player's journal as a
 * Session Log entry. The entry is created on the first real input (an empty
 * pad writes nothing); a remount or a second device carries on the entry made
 * since the session started rather than adding another.
 */
const { startedAt, entries } = defineProps<{
  /** The session's start; the pad only mounts once it is known (see `canEditSessionNote`). */
  startedAt: string;
  /** Already loaded: the pad only mounts once the journal read has settled, so the draft is seeded from the real entry. */
  entries: readonly PlayerJournalEntry[];
}>();

interface NoteDraft {
  content: string | null;
  sharedWithDm: boolean;
  /** Null until the first save creates the entry. */
  noteId: string | null;
}

const createMut = useCreateJournalEntry();
const updateMut = useUpdateJournalEntry();

const fromRow = (row: PlayerJournalEntry | null): NoteDraft => ({
  content: row?.content ?? null,
  sharedWithDm: row?.shared_with_dm ?? false,
  noteId: row?.id ?? null,
});

const existing = () => findSessionNote(entries, startedAt);
const draft = reactive<NoteDraft>(fromRow(existing()));

async function save(snapshot: NoteDraft) {
  // `content` is a required string column: an emptied note is stored as "".
  const content = snapshot.content ?? "";
  if (snapshot.noteId) {
    await updateMut.mutateAsync({ id: snapshot.noteId, update: { content, shared_with_dm: snapshot.sharedWithDm } });
    return;
  }
  const created = await createMut.mutateAsync({
    title: sessionNoteTitle(new Date()),
    content,
    category: SESSION_NOTE_CATEGORY,
    tags: [],
    is_private: true,
    shared_with_dm: snapshot.sharedWithDm,
    ref_type: null,
    ref_id: null,
    ref_label: null,
  });
  // The next save updates this entry even before the refetch brings it back.
  if (!draft.noteId) draft.noteId = created.id;
}

const { status, saveError, dirty, saving, reset } = useAutosave({
  draft,
  initial: () => fromRow(existing()),
  equal: (a, b) =>
    (a.content === b.content || (isBlankNote(a.content) && isBlankNote(b.content))) &&
    a.sharedWithDm === b.sharedWithDm,
  save,
  canSave: () => draft.noteId !== null || !isBlankNote(draft.content),
  errorMessage: "Could not save the note",
});

// The editor reads its value once and then only emits, so text replaced from
// here needs a new editor: bump the key when the saved copy differs from ours.
const revision = ref(0);
watch(existing, (row) => {
  if (dirty.value || saving.value) return;
  const next = fromRow(row);
  const replaced = next.content !== draft.content;
  reset(next);
  if (replaced) revision.value++;
});
</script>
