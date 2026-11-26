<template>
  <article class="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4" :data-testid="`story-passage-${passage.id}`" :data-by-dm="passage.by_dm">
    <div class="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
      <span data-testid="story-byline">{{ passage.by_dm ? "Told by the DM" : `You, ${when}` }}</span>
      <span v-if="isNew" class="font-bold text-destructive" data-testid="story-new">New</span>
      <span v-if="passage.dm_edited_at" class="italic" data-testid="story-dm-edited">Edited by your DM</span>
    </div>
    <details v-if="passage.dm_edited_at && passage.body_before_dm_edit" class="text-caption text-muted-foreground" data-testid="story-before-edit">
      <summary class="cursor-pointer">What you wrote</summary>
      <RichTextViewer :content="passage.body_before_dm_edit" class="mt-1" />
    </details>

    <template v-if="editable">
      <AppInput v-model="draft.title" size="body" tone="filled" aria-label="Passage heading" placeholder="A heading, such as After the Mere" />
      <RichTextEditor v-model="draft.body" size="sm" toolbar="focus" placeholder="What happened…" />
      <div class="flex items-center justify-between gap-2">
        <AutosaveStatus :status="status" :error="saveError" />
        <AppButton variant="ghost" size="xs" :icon="IconDelete" icon-size="xs" label="Remove" data-testid="story-remove" @click="remove" />
      </div>
    </template>
    <template v-else>
      <h3 v-if="passage.title" class="m-0 text-heading-xs font-semibold text-foreground">{{ passage.title }}</h3>
      <RichTextViewer v-if="passage.body" :content="passage.body" />
    </template>
  </article>
</template>

<script setup lang="ts">
/**
 * One passage of "My story" (frame 14). The player's own are theirs to write and remove, saved as they type; the DM's are
 * only read, marked as told by the DM, and offer nothing to change. When the DM has edited a passage the player wrote it
 * says so, with what the player wrote kept to read (#1279 item 30).
 */
import { reactive, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { updateMyPassage, useRemoveMyPassage } from "@/composables/canon/useMyStory";
import type { PlayerLorePassage } from "@/composables/canon/usePlayerCanon";
import { useAutosave } from "@/composables/useAutosave";
import { useConfirm } from "@/composables/useConfirm";
import { IconDelete } from "@/lib/icons";

const { passage, when, isNew = false, editable } = defineProps<{
  passage: PlayerLorePassage;
  /** "before play" or "after session N". */
  when: string;
  isNew?: boolean;
  /** True only for a passage the player wrote, outside a DM's preview. */
  editable: boolean;
}>();

interface PassageDraft { title: string; body: string | null }
const draft = reactive<PassageDraft>({ title: passage.title, body: passage.body });
const { status, saveError, dirty, reset, hold } = useAutosave<PassageDraft>({
  draft,
  initial: () => ({ title: passage.title, body: passage.body }),
  equal: (a, b) => a.title === b.title && a.body === b.body,
  save: (snapshot) => updateMyPassage(passage.id, { title: snapshot.title, body: snapshot.body }),
});
watch(() => [passage.title, passage.body], () => {
  if (!dirty.value && (passage.title !== draft.title || passage.body !== draft.body)) reset({ title: passage.title, body: passage.body });
});

const { confirm } = useConfirm();
const { mutate: removePassage } = useRemoveMyPassage();
async function remove() {
  const ok = await confirm(`Remove this passage? "${draft.title || "Untitled passage"}" is deleted.`, { title: "Remove this passage", confirmLabel: "Remove" });
  if (!ok) return;
  await hold();
  removePassage(passage.id);
}
</script>
