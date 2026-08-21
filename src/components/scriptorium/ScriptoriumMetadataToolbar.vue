<template>
  <div class="flex flex-wrap gap-2 items-end">
    <label class="flex-1 min-w-64">
      <span class="sr-only">Document title</span>
      <AppInput v-model="titleModel" tone="card" size="heading" placeholder="Document title…" />
    </label>
    <label>
      <span class="sr-only">Document type</span>
      <AppSelect v-model="docTypeModel">
        <option v-for="t in DOC_TYPE_OPTIONS" :key="t.value" :value="t.value">
          {{ t.label }}
        </option>
      </AppSelect>
    </label>
    <AppCheckbox
      label-role="label-lg"
      label="PUBLISHED"
      :model-value="isPublished"
      @update:model-value="$emit('update:isPublished', $event)"
    />
    <AppCheckbox
      label-role="label-lg"
      label="PAGE #S"
      :model-value="showPageNumbers"
      @update:model-value="$emit('update:showPageNumbers', $event)"
    />
    <template v-if="showPageNumbers">
      <AppInput
        v-model="footerTextModel"
        tone="card"
        size="caption"
        :block="false"
        placeholder="Footer text…"
        class="w-40"
      />
      <label class="flex items-center gap-1.5">
        <span class="text-eyebrow font-semibold text-muted-foreground whitespace-nowrap">START #</span>
        <AppInput v-model="pageNumberStartModel" type="number" tone="card" size="sm" min="1" class="w-14" />
      </label>
    </template>
    <AppButton
      variant="primary"
      size="md"
      :icon="IconSave"
      :label="isSaving ? 'Saving…' : isNew ? 'Create' : 'Save'"
      :disabled="isSaving || !title.trim()"
      @click="$emit('save')"
    />
    <AppButton
      v-if="!isNew"
      variant="destructive"
      size="md"
      :icon="IconDelete"
      :label="isDeleting ? 'Deleting…' : 'Delete'"
      :disabled="isDeleting"
      @click="$emit('delete')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DOC_TYPE_OPTIONS } from "@/lib/scriptorium/editorConstants";
import { IconSave, IconDelete } from "@/lib/icons";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";

const {
  title,
  docType,
  isPublished,
  showPageNumbers,
  footerText,
  pageNumberStart,
  isSaving = false,
  isDeleting = false,
  isNew = false,
} = defineProps<{
  title: string;
  docType: ScriptoriumDocType;
  isPublished: boolean;
  showPageNumbers: boolean;
  footerText: string;
  pageNumberStart: number;
  isSaving?: boolean;
  isDeleting?: boolean;
  isNew?: boolean;
}>();

const emit = defineEmits<{
  "update:title": [value: string];
  "update:docType": [value: string];
  "update:isPublished": [value: boolean];
  "update:showPageNumbers": [value: boolean];
  "update:footerText": [value: string];
  "update:pageNumberStart": [value: number];
  save: [];
  delete: [];
}>();

// AppInput/AppSelect require a two-way v-model; these props flow one level up
// through emits rather than owning their own state, so each gets a writable
// computed proxy at the component boundary.
const titleModel = computed({
  get: () => title,
  set: (value: string) => emit("update:title", value),
});
const docTypeModel = computed({
  get: () => docType,
  set: (value: ScriptoriumDocType) => emit("update:docType", value),
});
// Kept as a string model + Number() on write (rather than v-model.number) to match
// the original @change behaviour exactly: an emptied field became 0, not null.
const pageNumberStartModel = computed({
  get: () => String(pageNumberStart),
  set: (value: string) => emit("update:pageNumberStart", Number(value)),
});
const footerTextModel = computed({
  get: () => footerText,
  set: (value: string) => emit("update:footerText", value),
});
</script>
