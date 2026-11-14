<template>
  <div class="flex min-h-6 items-center gap-2 text-caption" aria-live="polite">
    <span v-if="status === 'paused'" class="text-muted-foreground">{{ pausedLabel }}</span>
    <span v-else-if="status === 'error'" role="alert" class="text-destructive">{{ error }}</span>
    <span v-else-if="status === 'saving'" class="text-muted-foreground">Saving…</span>
    <span v-else-if="status === 'dirty'" class="text-muted-foreground">Unsaved changes</span>
    <span v-else-if="justSaved" class="text-tone-success">Saved</span>
    <!-- Recovery action for the error state (e.g. "Reload saved beat"). -->
    <span v-if="status === 'error'" class="ml-auto"><slot name="error-action" /></span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { AutosaveStatus } from "@/composables/useAutosave";

/**
 * The one status line for an autosaving form. `paused` is the state where the
 * form refuses to save until something is fixed (a blank required title).
 *
 * "Saved" is said only right after a save the DM caused, and fades after
 * `SAVED_SHOWN_MS`. A form that merely opens, or sits saved, says nothing: a
 * standing "Saved" read as though something had been edited by accident (the
 * maintainer, 14 Nov 2026). The line keeps its height either way.
 */
const { status, error = "", pausedLabel = "Autosave paused" } = defineProps<{
  status: AutosaveStatus;
  error?: string;
  pausedLabel?: string;
}>();

const SAVED_SHOWN_MS = 5000;
const justSaved = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

function clearTimer() {
  if (timer !== null) clearTimeout(timer);
  timer = null;
}

watch(() => status, (next, previous) => {
  clearTimer();
  justSaved.value = previous === "saving" && next === "saved";
  if (justSaved.value) timer = setTimeout(() => { justSaved.value = false; timer = null; }, SAVED_SHOWN_MS);
});
onBeforeUnmount(clearTimer);
</script>
