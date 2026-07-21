<template>
  <div class="flex flex-col gap-5 max-w-3xl">
    <!-- Action bar -->
    <div class="flex items-center justify-end gap-2">
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="handleDelete"
      >
        <IconDelete class="h-3.5 w-3.5" />Delete
      </button>
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-label-lg font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        @click="router.push({ query: { ...route.query, edit: 'true' } })"
      >
        <IconEdit class="h-3.5 w-3.5" />Edit
      </button>
    </div>

    <!-- Metadata row -->
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-label-lg font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground capitalize">
        {{ note.category }}
      </span>
      <span v-if="note.session_num" class="text-label-lg font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
        Session {{ note.session_num }}
      </span>
      <span v-if="note.is_pinned" class="text-label-lg font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
        <IconPin class="inline h-3 w-3 mr-0.5" />Pinned
      </span>
      <span v-if="note.player_visible_to?.length" class="text-label-lg font-semibold px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
        Shared with players
      </span>
    </div>

    <!-- Tags -->
    <div v-if="note.tags?.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="tag in note.tags"
        :key="tag"
        class="px-2 py-0.5 rounded-full bg-muted font-fell text-xs text-muted-foreground"
      >
        {{ tag }}
      </span>
    </div>

    <!-- Content -->
    <div v-if="hasContent(note.content)" class="rounded-lg border border-border bg-card p-4">
      <RichTextViewer :content="note.content!" />
    </div>
    <p v-else class="font-fell text-sm text-muted-foreground italic">No content yet.</p>
  </div>
</template>

<script setup lang="ts">
import { IconDelete, IconEdit, IconPin } from '@/lib/icons';
import { useRoute, useRouter } from "vue-router";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteNote } from "@/composables/useNotes";
import { removeRichTextImages } from "@/composables/useImageUpload";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import type { Note } from "@/types/notes.types";

const props = defineProps<{ note: Note }>();

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const deleteMut = useDeleteNote();

function hasContent(content: string | null | undefined): boolean {
  if (!content) return false;
  try {
    const doc = JSON.parse(content);
    if (!Array.isArray(doc?.content) || doc.content.length === 0) return false;
    return doc.content.some(
      (n: { type: string; content?: unknown[] }) =>
        n.type !== "paragraph" || (n.content && n.content.length > 0),
    );
  } catch {
    return false;
  }
}

async function handleDelete() {
  const ok = await confirm(`Delete "${props.note.title}"? This cannot be undone.`, {
    title: "Delete Note",
    confirmLabel: "Delete",
  });
  if (!ok) return;
  removeRichTextImages(props.note.content);
  router.push("/notes");
  await deleteMut.mutateAsync(props.note.id);
}
</script>
