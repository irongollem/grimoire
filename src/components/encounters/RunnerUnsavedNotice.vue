<template>
  <p v-if="visible" class="shrink-0 border-b border-border bg-muted px-4 py-1.5 text-caption text-muted-foreground" role="status" data-testid="runner-unsaved">
    {{ message }}
  </p>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * Said while changes have not reached the server AND sending has failed at least once. An ordinary request in
 * flight is not worth saying (it would flicker on every click); a failed one means the DM's screen is ahead of
 * the saved fight, and a reload now would lose the difference. Calm on purpose: the runner keeps trying by itself.
 */
const { unsent, failures } = defineProps<{ unsent: number; failures: number }>();

const visible = computed(() => unsent > 0 && failures > 0);
const message = computed(() => `${unsent === 1 ? "1 change is" : `${unsent} changes are`} not saved yet. Trying again.`);
</script>
