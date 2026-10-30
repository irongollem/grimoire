<template>
  <Teleport to="body">
    <div
      ref="floatingRef"
      :style="floatingStyle"
      data-slip
      role="dialog"
      :aria-label="mode === 'view' && note ? 'Note' : 'New note'"
      class="z-300 flex w-64 max-w-[calc(100vw-1rem)] flex-col gap-2.5 rounded-md border border-border bg-popover p-3 text-foreground shadow-lg"
      @keydown.esc.stop="emit('close')"
    >
      <template v-if="editing">
        <textarea
          ref="textarea"
          v-model="draft"
          data-hand
          rows="4"
          aria-label="Note"
          placeholder="What needs a second look here?"
          data-field="input"
          :class="cn(fieldVariants({ tone: 'card', size: 'body' }), 'w-full resize-none')"
          @keydown.enter.meta.prevent="save"
          @keydown.enter.ctrl.prevent="save"
        />
        <p v-if="error" class="text-caption text-destructive" role="alert">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <AppButton variant="outline" size="sm" label="Cancel" @click="cancelEdit" />
          <AppButton variant="primary" size="sm" label="Save" :disabled="draft.trim() === '' || busy" :loading="busy" @click="save" />
        </div>
      </template>

      <template v-else-if="note">
        <p data-hand class="whitespace-pre-wrap text-body leading-snug">{{ note.body }}</p>
        <p v-if="error" class="text-caption text-destructive" role="alert">{{ error }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <AppButton v-if="note.block_id" variant="outline" size="sm" label="Edit this part" @click="emit('editBlock')" />
          <AppButton variant="outline" size="sm" :label="note.done ? 'Reopen' : 'Done'" :disabled="busy" @click="emit('toggleDone')" />
          <span class="ml-auto flex gap-1">
            <AppButton variant="ghost" size="icon-xs" :icon="IconEdit" icon-size="xs" aria-label="Edit note" @click="startEdit" />
            <AppButton variant="ghost" tone="danger" size="icon-xs" :icon="IconDelete" icon-size="xs" aria-label="Delete note" :disabled="busy" @click="emit('delete')" />
          </span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The popover on a pin (Scriptorium Chapters, frame 04): the note in the DM's
 * hand with "Edit this part" and "Done", or a textarea for a note not yet kept.
 * Anchored to the pin and teleported to the body, because a page clips what
 * overflows it.
 */
import { nextTick, onMounted, ref, toRef } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { fieldVariants } from "@/components/common/controls/fieldVariants";
import { cn } from "@/lib/utils";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { IconDelete, IconEdit } from "@/lib/icons";
import type { ScriptoriumNote } from "@/types/scriptorium.types";

const { note = null, anchor, busy = false, error = null } = defineProps<{
  /** The note shown; null while a new one is being written. */
  note?: ScriptoriumNote | null;
  anchor: HTMLElement;
  busy?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  save: [body: string];
  close: [];
  editBlock: [];
  toggleDone: [];
  delete: [];
}>();

const mode = note ? "view" : "new";
const editing = ref(note === null);
const draft = ref(note?.body ?? "");
const textarea = ref<HTMLTextAreaElement | null>(null);

const anchorRef = toRef(() => anchor);
const alwaysOpen = ref(true);
const { floatingRef, floatingStyle } = useAnchoredPopover(anchorRef, alwaysOpen, () => emit("close"));

function focusField() {
  void nextTick(() => textarea.value?.focus());
}
onMounted(() => {
  if (editing.value) focusField();
});

function startEdit() {
  draft.value = note?.body ?? "";
  editing.value = true;
  focusField();
}
function cancelEdit() {
  if (note === null) emit("close");
  else editing.value = false;
}
function save() {
  const body = draft.value.trim();
  if (body === "" || busy) return;
  emit("save", body);
}
</script>
