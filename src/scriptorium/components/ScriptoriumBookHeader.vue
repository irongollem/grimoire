<template>
  <header class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5 sm:px-6">
    <AppButton to="/scriptorium" variant="link" size="sm" :icon="IconChevronLeft" label="Scriptorium" />

    <h1 class="min-w-0 flex-1 basis-60 truncate text-heading-lg font-bold text-foreground" data-testid="book-title">
      {{ title || "Untitled" }}
    </h1>

    <AutosaveStatus :status="status" :error="error" />

    <AppButton
      variant="outline"
      size="md"
      :active="focus"
      :aria-pressed="focus"
      label="Focus"
      tooltip="Hide the chapter list while you write"
      @click="focus = !focus"
    />
    <AppButton variant="outline" size="md" label="Read as spreads" @click="emit('read')" />

    <!-- A book: Share beside the primary Export PDF. A handout: Print beside the primary Give to players. -->
    <template v-if="kind === 'book'">
      <AppButton
        variant="outline"
        size="md"
        :icon="IconShare"
        label="Share"
        :disabled="!canShare"
        :title="canShare ? undefined : shareHint"
        @click="emit('share')"
      />
      <AppButton variant="primary" size="md" :icon="IconExport" :label="exportLabel" :loading="isExporting" @click="emit('export')" />
    </template>
    <template v-else>
      <AppButton variant="outline" size="md" :icon="IconPrint" :label="isExporting ? exportLabel : 'Print'" :loading="isExporting" @click="emit('export')" />
      <slot name="give" />
    </template>

    <AppButton variant="outline" size="icon-sm" :icon="IconSettings" :tooltip="kind === 'handout' ? 'Handout settings' : 'Book settings'" @click="emit('settings')" />
  </header>
</template>

<script setup lang="ts">
/**
 * The editor's header (#1115 frames 02 and 10): back to the Scriptorium, the
 * book's title (renamed in Book settings, not here), the save status, Focus
 * (the chapter list steps aside), Read as spreads (the book as lamplit
 * spreads; you write on the page itself, so there is no mode switch), and the actions that depend on what the thing
 * is. A book offers Share and Export PDF; a handout offers Print and Give to
 * players (the Give button is the handout pieces' own, mounted in `give`).
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import type { AutosaveStatus as AutosaveState } from "@/composables/useAutosave";
import { pdfExportProgressLabel, type PdfExportProgress } from "@/scriptorium/composables/useScriptoriumPdf";
import { IconChevronLeft, IconExport, IconPrint, IconSettings, IconShare } from "@/lib/icons";
import type { ScriptoriumKind } from "@/scriptorium/types";

const { title, kind, status, error = "", canShare = true, shareHint = "", isExporting = false, progress = null } = defineProps<{
  title: string;
  kind: ScriptoriumKind;
  status: AutosaveState;
  error?: string;
  canShare?: boolean;
  shareHint?: string;
  isExporting?: boolean;
  progress?: PdfExportProgress | null;
}>();

/** Focus: the chapter list steps aside so the page you write on has the room. */
const focus = defineModel<boolean>("focus", { required: true });

const emit = defineEmits<{
  share: [];
  export: [];
  settings: [];
  /** Open the whole book as lamplit spreads. */
  read: [];
}>();

const exportLabel = computed(() => (isExporting ? pdfExportProgressLabel(progress) : "Export PDF"));
</script>
