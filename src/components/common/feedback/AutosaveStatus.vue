<template>
  <div class="flex min-h-6 items-center gap-2 text-caption" aria-live="polite">
    <span v-if="status === 'paused'" class="text-muted-foreground">{{ pausedLabel }}</span>
    <span v-else-if="status === 'error'" role="alert" class="text-destructive">{{ error }}</span>
    <span v-else-if="status === 'saving'" class="text-muted-foreground">Saving…</span>
    <span v-else-if="status === 'dirty'" class="text-muted-foreground">Unsaved changes</span>
    <span v-else class="text-tone-success">Saved</span>
    <!-- Recovery action for the error state (e.g. "Reload saved beat"). -->
    <span v-if="status === 'error'" class="ml-auto"><slot name="error-action" /></span>
  </div>
</template>

<script setup lang="ts">
import type { AutosaveStatus } from "@/composables/useAutosave";

/**
 * The one status line for an autosaving form. `paused` is the state where the
 * form refuses to save until something is fixed (a blank required title).
 */
const { status, error = "", pausedLabel = "Autosave paused" } = defineProps<{
  status: AutosaveStatus;
  error?: string;
  pausedLabel?: string;
}>();
</script>
