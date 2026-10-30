<template>
  <AppModal :open="open" size="md" panel-class="max-h-[min(46rem,92vh)]" @close="emit('close')">
    <ModalHeader :title="heading" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <label class="block">
        <span class="mb-1 block text-caption text-muted-foreground">Title</span>
        <AppInput :model-value="draft.title" tone="underline" size="body" @update:model-value="patch({ title: $event })" />
        <span v-if="!draft.title.trim()" class="mt-1 block text-caption text-destructive">A book needs a title before it saves.</span>
      </label>

      <div class="grid grid-cols-2 gap-x-4 gap-y-3">
        <label class="block">
          <span class="mb-1 block text-caption text-muted-foreground">Kind</span>
          <AppSelect :model-value="draft.kind" block @update:model-value="setKind">
            <option value="book">Book</option>
            <option value="handout" :disabled="chapterCount > 1">Handout</option>
          </AppSelect>
        </label>
        <label class="block">
          <span class="mb-1 block text-caption text-muted-foreground">Campaign</span>
          <AppSelect :model-value="draft.campaignId" block @update:model-value="patch({ campaignId: $event })">
            <option v-for="c in campaignOptions" :key="c.value ?? '__none__'" :value="c.value">{{ c.label }}</option>
          </AppSelect>
        </label>
        <label class="block">
          <span class="mb-1 block text-caption text-muted-foreground">Look</span>
          <AppSelect :model-value="draft.theme" block @update:model-value="patch({ theme: $event })">
            <option v-for="id in looks" :key="id" :value="id">{{ scriptoriumLook(id).label }}</option>
          </AppSelect>
        </label>
        <label class="block">
          <span class="mb-1 block text-caption text-muted-foreground">Page size</span>
          <AppSelect :model-value="draft.pageSize" block @update:model-value="patch({ pageSize: $event })">
            <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
          </AppSelect>
        </label>
      </div>
      <p v-if="chapterCount > 1 && draft.kind === 'book'" class="-mt-2 text-caption text-muted-foreground">
        A handout is one sheet, so a book with several chapters stays a book.
      </p>

      <div class="space-y-2.5">
        <AppCheckbox label="Two columns" :model-value="draft.isTwoColumn" @update:model-value="patch({ isTwoColumn: $event })" />
        <AppCheckbox
          label="Ink-friendly (lighter backgrounds for home printing)"
          :model-value="draft.inkFriendly"
          @update:model-value="patch({ inkFriendly: $event })"
        />
        <div class="flex flex-wrap items-center gap-2">
          <AppCheckbox
            label="Page numbers, starting at"
            :model-value="draft.showPageNumbers"
            @update:model-value="patch({ showPageNumbers: $event })"
          />
          <AppInput
            :model-value="String(draft.pageNumberStart)"
            type="number"
            min="1"
            tone="underline"
            size="sm"
            :block="false"
            class="w-14 text-center"
            aria-label="First page number"
            :disabled="!draft.showPageNumbers"
            @update:model-value="setStart"
          />
        </div>
        <AppCheckbox label="Published" :model-value="draft.isPublished" @update:model-value="patch({ isPublished: $event })" />
      </div>

      <label class="block">
        <span class="mb-1 block text-caption text-muted-foreground">Footer text</span>
        <AppInput :model-value="draft.footerText" tone="underline" size="body" @update:model-value="patch({ footerText: $event })" />
      </label>

      <div>
        <span class="mb-1 block text-caption text-muted-foreground">Tags</span>
        <TagInput :model-value="draft.tags" @update:model-value="patch({ tags: $event })" />
      </div>
    </div>

    <div class="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
      <AppButton variant="link" tone="danger" size="sm" :label="deleting ? 'Deleting…' : draft.kind === 'handout' ? 'Delete handout' : 'Delete book'" :disabled="deleting" @click="emit('delete')" />
      <AutosaveStatus :status="status" :error="error" paused-label="Needs a title" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * Book settings (#1115 frame 06): everything that applies to the whole book
 * behind one button. It replaces the metadata row and the layout controls the
 * editor's toolbar used to carry. Nothing here is saved by a button: the
 * shell's autosave writes each change, and the status line says so.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { themeForKind, type BookSettingsDraft } from "@/composables/scriptorium/useBookSettings";
import type { AutosaveStatus as AutosaveState } from "@/composables/useAutosave";
import { BOOK_LOOKS, PAPERS, scriptoriumLook } from "@/lib/scriptorium/looks";
import type { ScriptoriumKind, ScriptoriumPageSize } from "@/types/scriptorium.types";

const { open, draft, chapterCount, campaignOptions, status, error = "", deleting = false } = defineProps<{
  open: boolean;
  draft: BookSettingsDraft;
  chapterCount: number;
  campaignOptions: { value: string | null; label: string }[];
  status: AutosaveState;
  error?: string;
  deleting?: boolean;
}>();

const emit = defineEmits<{
  patch: [values: Partial<BookSettingsDraft>];
  delete: [];
  close: [];
}>();

const PAGE_SIZES: ScriptoriumPageSize[] = ["A4", "A5", "Letter"];

const heading = computed(() => (draft.kind === "handout" ? "Handout Settings" : "Book Settings"));
const looks = computed(() => (draft.kind === "handout" ? PAPERS : BOOK_LOOKS));

function patch(values: Partial<BookSettingsDraft>) {
  emit("patch", values);
}

/** Changing kind changes which looks fit, so the look follows when it no longer does. */
function setKind(kind: ScriptoriumKind) {
  patch({ kind, theme: themeForKind(kind, draft.theme) });
}

/** An emptied or sub-1 field keeps the last good number rather than writing 0. */
function setStart(value: string) {
  const n = Math.floor(Number(value));
  if (Number.isFinite(n) && n >= 1) patch({ pageNumberStart: n });
}
</script>
