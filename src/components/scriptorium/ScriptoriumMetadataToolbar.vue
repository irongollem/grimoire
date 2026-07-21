<template>
  <div class="flex flex-wrap gap-2 items-end">
    <label class="flex-1 min-w-64">
      <span class="sr-only">Document title</span>
      <input
        :value="title"
        placeholder="Document title…"
        class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-base font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:title', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <label>
      <span class="sr-only">Document type</span>
      <select
        :value="docType"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @change="$emit('update:docType', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="t in DOC_TYPE_OPTIONS" :key="t.value" :value="t.value">
          {{ t.label }}
        </option>
      </select>
    </label>
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        :checked="isPublished"
        class="rounded"
        @change="$emit('update:isPublished', ($event.target as HTMLInputElement).checked)"
      />
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">PUBLISHED</span>
    </label>
    <label class="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        :checked="showPageNumbers"
        class="rounded"
        @change="$emit('update:showPageNumbers', ($event.target as HTMLInputElement).checked)"
      />
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">PAGE #S</span>
    </label>
    <template v-if="showPageNumbers">
      <input
        :value="footerText"
        placeholder="Footer text…"
        class="w-40 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:footerText', ($event.target as HTMLInputElement).value)"
      />
      <label class="flex items-center gap-1.5">
        <span class="text-eyebrow font-semibold text-muted-foreground whitespace-nowrap">START #</span>
        <input
          :value="pageNumberStart"
          type="number"
          min="1"
          class="w-14 bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="$emit('update:pageNumberStart', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </template>
    <button
      type="button"
      :disabled="isSaving || !title.trim()"
      class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
      @click="$emit('save')"
    >
      <IconSave class="h-3.5 w-3.5" />
      {{ isSaving ? "Saving…" : isNew ? "Create" : "Save" }}
    </button>
    <button
      v-if="!isNew"
      type="button"
      :disabled="isDeleting"
      class="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      @click="$emit('delete')"
    >
      <IconDelete class="h-3.5 w-3.5" />
      {{ isDeleting ? "Deleting…" : "Delete" }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { DOC_TYPE_OPTIONS } from "@/lib/scriptorium/editorConstants";
import { IconSave, IconDelete } from "@/lib/icons";
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

defineEmits<{
  "update:title": [value: string];
  "update:docType": [value: string];
  "update:isPublished": [value: boolean];
  "update:showPageNumbers": [value: boolean];
  "update:footerText": [value: string];
  "update:pageNumberStart": [value: number];
  save: [];
  delete: [];
}>();
</script>

<style scoped>
input:not([type="checkbox"]):not([type="radio"]),
select {
  background-color: var(--card);
  color: var(--foreground);
}
</style>
