<template>
  <div v-if="variant === 'inline' && yielded" class="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-caption text-muted-foreground">
    <IconLock class="h-3 w-3 shrink-0" aria-hidden="true" />
    <span class="flex-1">Open in the scratchpad</span>
    <AppButton variant="ghost" size="toolbar" label="Close" :icon="IconClose" @click="scratchpad.toggle()" />
  </div>

  <section v-else-if="variant === 'inline'" class="flex flex-col gap-1.5" aria-label="DM notes">
    <div class="flex items-center gap-2">
      <IconLock class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="text-label-lg font-semibold text-muted-foreground">DM notes</span>
      <span class="text-caption text-muted-foreground">Only you see this</span>
      <AutosaveStatus class="ml-auto" :status="note.status.value" :error="note.saveError.value" />
    </div>
    <!-- The focus toolbar keeps a note nobody is writing in down to its text. -->
    <RichTextEditor
      v-if="!note.loading.value"
      :key="note.revision.value"
      v-model="note.draft.content"
      :placeholder="placeholder"
      size="sm"
      toolbar="focus"
    />
  </section>

  <div v-else class="flex min-h-0 flex-col">
    <RichTextEditor
      v-if="!note.loading.value"
      :key="note.revision.value"
      v-model="note.draft.content"
      :placeholder="placeholder"
      size="sm"
      toolbar="focus"
    />
    <AutosaveStatus :status="note.status.value" :error="note.saveError.value" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AutosaveStatus from "@/components/common/AutosaveStatus.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { IconClose, IconLock } from "@/lib/icons";
import { useDmNote } from "@/composables/notes/useDmNote";
import { useScratchpadStore } from "@/stores/scratchpad";
import type { DmNoteEntityType } from "@/lib/dmNotes/registry";

/**
 * A DM's one note on an entity (#983). Inline, it registers the entity with
 * the scratchpad so the docked panel knows what is on screen, and it steps
 * aside while the panel shows that same entity: one note never has two live
 * editors.
 */
const { type, id, label, variant = "inline" } = defineProps<{
  type: DmNoteEntityType;
  id: string;
  label: string;
  variant?: "inline" | "panel";
}>();

const placeholder = "Jot something down…";
const scratchpad = useScratchpadStore();

const yielded = computed(() => variant === "inline" && scratchpad.isShowing(type, id));

// A yielded box hands its subject away, which flushes any pending edit first.
const note = useDmNote(() => (yielded.value ? null : { type, id, label }));

let unregister: (() => void) | null = null;
watch(
  () => [variant, type, id, label] as const,
  ([v, t, i, l]) => {
    unregister?.();
    unregister = v === "inline" ? scratchpad.register({ type: t, id: i, label: l }) : null;
  },
  { immediate: true },
);
onBeforeUnmount(() => unregister?.());
</script>
