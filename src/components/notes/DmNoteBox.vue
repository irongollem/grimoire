<template>
  <div v-if="variant === 'inline' && yielded" class="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-caption text-muted-foreground">
    <IconLock class="h-3 w-3 shrink-0" aria-hidden="true" />
    <span class="flex-1">Open in the scratchpad</span>
    <AppButton variant="ghost" size="toolbar" label="Close" :icon="IconClose" @click="scratchpad.toggle()" />
  </div>

  <div v-else class="flex min-h-0 flex-col gap-3">
    <section v-if="variant === 'inline'" data-hand class="flex flex-col gap-1.5" aria-label="DM notes">
      <div class="flex items-center gap-2">
        <IconLock class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="text-label-lg font-semibold text-muted-foreground">DM notes</span>
        <span class="text-caption text-muted-foreground">Players never see this</span>
        <AutosaveStatus v-if="!note.loading.value && !readonly" class="ml-auto" :status="note.status.value" :error="note.saveError.value" />
      </div>
      <!-- Status stays hidden until the note's read lands: before then there is no editor,
           and "Saved" would claim a save that never happened. -->
      <!-- The focus toolbar keeps a note nobody is writing in down to its text. -->
      <!-- A row this account may read but not write (a co-DM on the owner's
           library, #590): the note shows, and nothing offers to save it. -->
      <RichTextViewer v-if="readonly && !note.loading.value && note.draft.content" :content="note.draft.content" />
      <RichTextEditor
        v-else-if="!readonly && !note.loading.value"
        :key="note.revision.value"
        v-model="note.draft.content"
        :placeholder="placeholder"
        size="sm"
        toolbar="focus"
      />
    </section>

    <div v-else data-hand class="flex min-h-0 flex-col">
      <RichTextEditor
        v-if="!note.loading.value"
        :key="note.revision.value"
        v-model="note.draft.content"
        :placeholder="placeholder"
        size="sm"
        toolbar="focus"
      />
      <AutosaveStatus v-if="!note.loading.value" :status="note.status.value" :error="note.saveError.value" />
    </div>

    <!-- Co-DMs (#590): what the other DMs of this campaign wrote, to read when
         standing in for them. No editor and no status: it is theirs. -->
    <section
      v-for="other in otherNotes"
      :key="other.id"
      data-hand
      data-test="other-dm-note"
      class="flex flex-col gap-1.5"
      :aria-label="other.heading"
    >
      <div class="flex items-center gap-2">
        <IconLock class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="text-label-lg font-semibold text-muted-foreground">{{ other.heading }}</span>
      </div>
      <RichTextViewer :content="other.content" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { IconClose, IconLock } from "@/lib/icons";
import { useDmNote } from "@/composables/notes/useDmNote";
import { useOtherDmNotes } from "@/composables/notes/useOtherDmNotes";
import { useScratchpadStore } from "@/stores/scratchpad";
import type { DmNoteEntityType } from "@/lib/dmNotes/registry";

/**
 * A DM's one note on an entity (#983). Inline, it registers the entity with
 * the scratchpad so the docked panel knows what is on screen, and it steps
 * aside while the panel shows that same entity: one note never has two live
 * editors.
 */
const { type, id, label, variant = "inline", readonly = false } = defineProps<{
  type: DmNoteEntityType;
  id: string;
  label: string;
  variant?: "inline" | "panel";
  /** Show the note without an editor, and keep it out of the scratchpad: the
   *  row's write would match nothing under RLS (#590). Inline only. */
  readonly?: boolean;
}>();

const placeholder = "Jot something down…";
const scratchpad = useScratchpadStore();

const yielded = computed(() => variant === "inline" && scratchpad.isShowing(type, id));

// A yielded box hands its subject away, which flushes any pending edit first.
const note = useDmNote(() => (yielded.value ? null : { type, id, label }));

// A yielded box shows nothing, so it asks for nothing; the scratchpad's own box reads them.
const { notes: otherNotes } = useOtherDmNotes(() => (yielded.value ? null : { type, id }));

let unregister: (() => void) | null = null;
watch(
  () => [variant, type, id, label] as const,
  ([v, t, i, l]) => {
    unregister?.();
    unregister = v === "inline" && !readonly ? scratchpad.register({ type: t, id: i, label: l }) : null;
  },
  { immediate: true },
);
onBeforeUnmount(() => unregister?.());
</script>
